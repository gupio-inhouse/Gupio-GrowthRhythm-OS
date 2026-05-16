import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

async function getActorDepartmentId(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  return actor?.departmentId ?? null;
}

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
  const where: Record<string, unknown> = {
    orgId: req.user!.orgId,
    ...(departmentId ? { departmentId: departmentId as string } : {}),
  };

  if (['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(req.user!.role)) {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId) {
      res.json([]);
      return;
    }
    where.departmentId = actorDepartmentId;
  }

  const kras = await prisma.kRA.findMany({
    where,
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

router.post('/', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), auditLog('kra', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const department = await prisma.department.findFirst({
    where: { id: parsed.data.departmentId, orgId: req.user!.orgId, isActive: true },
    select: { id: true },
  });

  if (!department) {
    res.status(400).json({ error: 'Department not found' });
    return;
  }

  if (parsed.data.goalId) {
    const goal = await prisma.goal.findFirst({
      where: { id: parsed.data.goalId, orgId: req.user!.orgId },
      select: { id: true },
    });

    if (!goal) {
      res.status(400).json({ error: 'Goal not found' });
      return;
    }
  }

  const owner = await prisma.user.findFirst({
    where: {
      id: parsed.data.ownerUserId,
      orgId: req.user!.orgId,
      status: 'ACTIVE',
      departmentId: parsed.data.departmentId,
    },
    select: { id: true },
  });

  if (!owner) {
    res.status(400).json({ error: 'KRA owner must be an active user in the selected department' });
    return;
  }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId || actorDepartmentId !== parsed.data.departmentId) {
      res.status(403).json({ error: 'Department heads can only create KRAs in their own department' });
      return;
    }
  }

  const kra = await prisma.kRA.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { owner: { select: { id: true, name: true } } },
  });

  res.status(201).json(kra);
});

router.patch('/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), auditLog('kra', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const existingKra = await prisma.kRA.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, departmentId: true },
  });

  if (!existingKra) {
    res.status(404).json({ error: 'KRA not found' });
    return;
  }

  const nextDepartmentId = (req.body.departmentId as string | undefined) ?? existingKra.departmentId;

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId || actorDepartmentId !== existingKra.departmentId || actorDepartmentId !== nextDepartmentId) {
      res.status(403).json({ error: 'Department heads can only update KRAs in their own department' });
      return;
    }
  }

  if (req.body.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: req.body.departmentId as string, orgId: req.user!.orgId, isActive: true },
      select: { id: true },
    });

    if (!department) {
      res.status(400).json({ error: 'Department not found' });
      return;
    }
  }

  if (req.body.goalId) {
    const goal = await prisma.goal.findFirst({
      where: { id: req.body.goalId as string, orgId: req.user!.orgId },
      select: { id: true },
    });

    if (!goal) {
      res.status(400).json({ error: 'Goal not found' });
      return;
    }
  }

  const nextOwnerUserId = (req.body.ownerUserId as string | undefined) ?? undefined;
  if (nextOwnerUserId) {
    const owner = await prisma.user.findFirst({
      where: {
        id: nextOwnerUserId,
        orgId: req.user!.orgId,
        status: 'ACTIVE',
        departmentId: nextDepartmentId,
      },
      select: { id: true },
    });

    if (!owner) {
      res.status(400).json({ error: 'KRA owner must be an active user in the selected department' });
      return;
    }
  }

  const updatedKra = await prisma.kRA.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  res.json(updatedKra);
});

export default router;
