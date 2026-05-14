import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(['COMPANY', 'DEPARTMENT', 'TEAM']).default('COMPANY'),
  ownerUserId: z.string(),
  target: z.number().optional(),
  unit: z.string().optional(),
  period: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  parentGoalId: z.string().optional(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const goals = await prisma.goal.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      owner: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { kras: true, subGoals: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(goals);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const goal = await prisma.goal.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { owner: { select: { id: true, name: true } } },
  });

  res.status(201).json(goal);
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const goal = await prisma.goal.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  res.json(goal);
});

export default router;
