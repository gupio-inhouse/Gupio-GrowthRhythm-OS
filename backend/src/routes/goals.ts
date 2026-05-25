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
  const where: Record<string, unknown> = { orgId: req.user!.orgId };

  if (['OWNER', 'COMPANY_ADMIN'].includes(req.user!.role)) {
    // CEO/admins only see company-level goals — not dept/team goals owned by dept heads
    where.type = 'COMPANY';
  } else if (req.user!.role === 'DEPARTMENT_HEAD') {
    const departmentId = await getActorDepartmentId(req.user!.userId);
    if (!departmentId) {
      res.json([]);
      return;
    }
    where.OR = [
      { ownerUserId: req.user!.userId },
      { kras: { some: { departmentId } } },
    ];
  } else if (['MANAGER', 'TEAM_MEMBER'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const goals = await prisma.goal.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { kras: true, subGoals: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(goals);
});

router.post('/', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const owner = await prisma.user.findFirst({
    where: {
      id: parsed.data.ownerUserId,
      orgId: req.user!.orgId,
      status: 'ACTIVE',
    },
    select: { id: true, departmentId: true },
  });

  if (!owner) {
    res.status(400).json({ error: 'Goal owner must be an active user in your organization' });
    return;
  }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId) {
      res.status(403).json({ error: 'Department head must belong to a department' });
      return;
    }

    if (parsed.data.type === 'COMPANY') {
      res.status(403).json({ error: 'Department heads cannot create company goals' });
      return;
    }

    if (parsed.data.ownerUserId !== req.user!.userId || owner.departmentId !== actorDepartmentId) {
      res.status(403).json({ error: 'Department heads can only create goals they own in their department' });
      return;
    }
  }

  const goal = await prisma.goal.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { owner: { select: { id: true, name: true } } },
  });

  auditLog('goal', 'CREATE');
  res.status(201).json(goal);
});

router.patch('/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const goal = await prisma.goal.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: { kras: { select: { departmentId: true } } },
  });

  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    const belongsToDepartment = goal.kras.some((kra) => kra.departmentId === actorDepartmentId);
    const ownsGoal = goal.ownerUserId === req.user!.userId;

    if (!ownsGoal && !belongsToDepartment) {
      res.status(403).json({ error: 'You can only update goals in your department' });
      return;
    }

    if (req.body.ownerUserId && req.body.ownerUserId !== req.user!.userId) {
      res.status(403).json({ error: 'Department heads cannot reassign goal ownership' });
      return;
    }

    if (req.body.type === 'COMPANY') {
      res.status(403).json({ error: 'Department heads cannot convert goals to company goals' });
      return;
    }
  }

  const nextOwnerUserId = (req.body.ownerUserId as string | undefined) ?? goal.ownerUserId;
  if (nextOwnerUserId !== goal.ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: {
        id: nextOwnerUserId,
        orgId: req.user!.orgId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!owner) {
      res.status(400).json({ error: 'Goal owner must be an active user in your organization' });
      return;
    }
  }

  const updatedGoal = await prisma.goal.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  auditLog('goal', 'UPDATE');
  res.json(updatedGoal);
});

router.delete('/:id', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const goal = await prisma.goal.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, _count: { select: { kras: true } } },
  });
  if (!goal) { res.status(404).json({ error: 'Goal not found' }); return; }
  if (goal._count.kras > 0) {
    res.status(400).json({ error: 'Cannot delete a goal that has KRAs. Remove the KRAs first.' });
    return;
  }
  await prisma.goal.delete({ where: { id: req.params.id as string, orgId: req.user!.orgId } });
  res.json({ success: true });
});

export default router;
