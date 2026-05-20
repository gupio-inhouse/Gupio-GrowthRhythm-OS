import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { sendFeedbackReceivedEmail, sendFeedbackStatusEmail } from '../services/email.service';

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: z.enum(['BUG', 'FEATURE_REQUEST', 'UI_UX', 'PERFORMANCE', 'OTHER']).default('OTHER'),
});

// POST /feedback — any authenticated user
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { departmentId: true },
  });

  const feedback = await prisma.appFeedback.create({
    data: {
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      departmentId: user?.departmentId ?? null,
      ...parsed.data,
    },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      createdAt: true,
    },
  });

  // Email all owners/admins in the org (fire-and-forget)
  prisma.user.findMany({
    where: { orgId: req.user!.orgId, role: { in: ['OWNER', 'COMPANY_ADMIN'] }, status: 'ACTIVE' },
    select: { name: true, email: true },
  }).then(async (owners) => {
    const submitter = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, department: { select: { name: true } } },
    });
    for (const owner of owners) {
      sendFeedbackReceivedEmail({
        to: owner.email,
        ownerName: owner.name,
        submitterName: submitter?.name ?? 'A team member',
        department: submitter?.department?.name ?? null,
        title: feedback.title,
        category: feedback.category,
        appUrl: APP_URL,
      }).catch(console.error);
    }
  }).catch(console.error);

  res.status(201).json(feedback);
});

// GET /feedback — OWNER / COMPANY_ADMIN only
router.get('/', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;

  const feedback = await prisma.appFeedback.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      upvotes: true,
      createdAt: true,
      user: { select: { id: true, name: true, role: true } },
      department: { select: { id: true, name: true, slug: true } },
      votes: { where: { userId: req.user!.userId }, select: { id: true } },
    },
  });

  // Flatten votes into a boolean hasVoted field
  const result = feedback.map((f) => ({ ...f, hasVoted: f.votes.length > 0, votes: undefined }));
  res.json(result);
});

// PATCH /feedback/:id/status — OWNER / COMPANY_ADMIN only
router.patch('/:id/status', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { status } = req.body as { status: string };
  const validStatuses = ['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IMPLEMENTED', 'DISMISSED'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const feedback = await prisma.appFeedback.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: { status: status as never },
    select: { id: true, status: true },
  });

  // Email the original submitter about the status change
  prisma.appFeedback.findUnique({
    where: { id: req.params.id as string },
    select: { title: true, user: { select: { name: true, email: true } } },
  }).then((fb) => {
    if (!fb) return;
    sendFeedbackStatusEmail({
      to: fb.user.email,
      submitterName: fb.user.name,
      title: fb.title,
      status,
      appUrl: APP_URL,
    }).catch(console.error);
  }).catch(console.error);

  res.json(feedback);
});

// POST /feedback/:id/upvote — any authenticated user, toggles vote
router.post('/:id/upvote', async (req: AuthRequest, res: Response) => {
  const feedbackId = req.params.id as string;
  const userId = req.user!.userId;

  // Verify the feedback belongs to this org
  const feedback = await prisma.appFeedback.findFirst({
    where: { id: feedbackId, orgId: req.user!.orgId },
    select: { id: true, upvotes: true },
  });
  if (!feedback) { res.status(404).json({ error: 'Not found' }); return; }

  const existing = await prisma.appFeedbackVote.findUnique({
    where: { feedbackId_userId: { feedbackId, userId } },
  });

  if (existing) {
    // Remove vote
    await prisma.$transaction([
      prisma.appFeedbackVote.delete({ where: { feedbackId_userId: { feedbackId, userId } } }),
      prisma.appFeedback.update({ where: { id: feedbackId }, data: { upvotes: { decrement: 1 } } }),
    ]);
    res.json({ upvoted: false, upvotes: Math.max(0, feedback.upvotes - 1) });
  } else {
    // Add vote
    await prisma.$transaction([
      prisma.appFeedbackVote.create({ data: { feedbackId, userId } }),
      prisma.appFeedback.update({ where: { id: feedbackId }, data: { upvotes: { increment: 1 } } }),
    ]);
    res.json({ upvoted: true, upvotes: feedback.upvotes + 1 });
  }
});

export default router;
