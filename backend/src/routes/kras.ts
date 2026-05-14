import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  departmentId: z.string(),
  goalId: z.string().optional(),
  ownerUserId: z.string(),
  target: z.number(),
  unit: z.string().optional(),
  period: z.string(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.query;
  const kras = await prisma.kRA.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(departmentId ? { departmentId: departmentId as string } : {}),
    },
    include: {
      owner: { select: { id: true, name: true, avatarUrl: true } },
      department: { select: { id: true, name: true, slug: true } },
      goal: { select: { id: true, title: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(kras);
});

router.post('/', auditLog('kra', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const kra = await prisma.kRA.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { owner: { select: { id: true, name: true } } },
  });

  res.status(201).json(kra);
});

router.patch('/:id', auditLog('kra', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const kra = await prisma.kRA.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  res.json(kra);
});

export default router;
