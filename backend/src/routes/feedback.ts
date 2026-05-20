import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

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
      createdAt: true,
      user: { select: { id: true, name: true, role: true } },
      department: { select: { id: true, name: true, slug: true } },
    },
  });

  res.json(feedback);
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

  res.json(feedback);
});

export default router;
