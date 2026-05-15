import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { callClaude, deductAiCredits } from '../services/ai.service';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  type: z.enum(['TACTICAL', 'STRATEGIC', 'ONE_ON_ONE', 'DEPARTMENT']),
  departmentId: z.string().optional(),
  scheduledAt: z.string().datetime(),
  agenda: z.string().optional(),
});

const updateSchema = z.object({
  conductedAt: z.string().datetime().optional(),
  agenda: z.string().optional(),
  decisions: z.string().optional(),
  actionItems: z
    .array(
      z.object({
        text: z.string(),
        owner: z.string().optional(),
        dueDate: z.string().optional(),
        done: z.boolean().default(false),
      })
    )
    .optional(),
});

// GET /reviews
router.get('/', async (req: AuthRequest, res: Response) => {
  const { type, departmentId } = req.query;

  const where: Record<string, unknown> = { orgId: req.user!.orgId };
  if (type) where.type = type;
  if (departmentId) where.departmentId = departmentId;

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { scheduledAt: 'desc' },
  });

  res.json(reviews);
});

// POST /reviews
router.post(
  '/',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  auditLog('review', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const review = await prisma.review.create({
      data: {
        ...parsed.data,
        orgId: req.user!.orgId,
        createdBy: req.user!.userId,
        scheduledAt: new Date(parsed.data.scheduledAt),
      },
    });

    res.status(201).json(review);
  }
);

// GET /reviews/:id
router.get('/:id', auditLog('review', 'VIEW'), async (req: AuthRequest, res: Response) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
  });

  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }

  res.json(review);
});

// PATCH /reviews/:id
router.patch('/:id', auditLog('review', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.conductedAt) data.conductedAt = new Date(parsed.data.conductedAt);

  const review = await prisma.review.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
  });

  res.json(review);
});

// DELETE /reviews/:id
router.delete(
  '/:id',
  requireRole('OWNER', 'COMPANY_ADMIN'),
  auditLog('review', 'DELETE'),
  async (req: AuthRequest, res: Response) => {
    await prisma.review.delete({
      where: { id: req.params.id as string, orgId: req.user!.orgId },
    });

    res.json({ success: true });
  }
);

// POST /reviews/:id/ai-agenda
router.post('/:id/ai-agenda', async (req: AuthRequest, res: Response) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
  });

  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }

  const hasCredits = await deductAiCredits(req.user!.orgId, 2);
  if (!hasCredits) {
    res.status(402).json({ error: 'Insufficient AI credits' });
    return;
  }

  const context = req.body.context as string | undefined;
  const prompt = `Generate a structured ${review.type.toLowerCase().replace('_', ' ')} review agenda in exactly 5 bullet points. Each bullet should be a clear, actionable agenda item suitable for a business review meeting.${context ? `\n\nAdditional context: ${context}` : ''}`;

  const agenda = await callClaude(
    prompt,
    'You are an expert business operations coach. Generate concise, practical review agenda items for Indian SMBs. Return only the 5 bullet points, each starting with "• ".'
  );

  res.json({ agenda });
});

export default router;
