import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification } from '../services/notification.service';
import { getUserDeptAccess } from '../lib/deptAccess';
import { deleteFromS3 } from '../lib/s3';

const router = Router();
router.use(authenticate);

const MUTATE_ROLES = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'];

async function resolveDeptScope(userId: string, orgId: string, role: string, requestedDeptId?: string) {
  if (requestedDeptId) return { type: 'explicit' as const, departmentIds: [requestedDeptId] };
  if (['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) return { type: 'all' as const };

  const access = await getUserDeptAccess(userId, orgId, role);
  if (access?.accessType === 'FULL') return { type: 'all' as const };
  if (access?.accessType === 'SPECIFIC') return { type: 'specific' as const, departmentIds: access.departmentIds };

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  return me?.departmentId ? { type: 'specific' as const, departmentIds: [me.departmentId] } : { type: 'none' as const };
}

async function canAccessDepartment(userId: string, orgId: string, role: string, departmentId: string) {
  const scope = await resolveDeptScope(userId, orgId, role);
  if (scope.type === 'all') return true;
  if (scope.type === 'specific') return scope.departmentIds.includes(departmentId);
  return false;
}

// Shared by the two attachment routes below — loads the goal and checks the same
// MUTATE_ROLES + department-scope rule as PATCH/DELETE /goals/:id.
async function getGoalForMutation(req: AuthRequest, goalId: string) {
  const { orgId, userId, role } = req.user!;
  if (!MUTATE_ROLES.includes(role)) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  const goal = await prisma.goal.findUnique({
    where: { id: goalId, orgId },
    select: { id: true, departmentId: true },
  });
  if (!goal) {
    return { error: { status: 404, body: { error: 'Goal not found' } } };
  }
  if (!(await canAccessDepartment(userId, orgId, role, goal.departmentId))) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { goal };
}

const goalInclude = {
  createdBy: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, slug: true } },
  parentGoal: { select: { id: true, title: true, cycle: true, targetDate: true } },
  subGoals: {
    select: {
      id: true,
      title: true,
      description: true,
      targetDate: true,
      status: true,
      progressPercent: true,
      cycle: true,
    },
  },
  attachments: {
    select: { id: true, name: true, url: true, size: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} as const;

// GET /goals?departmentId=&cycle=STRATEGIC|TACTICAL&parentGoalId=&reviewId=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, cycle, parentGoalId, reviewId } = req.query;
  const { orgId, userId, role } = req.user!;

  const scope = await resolveDeptScope(userId, orgId, role, departmentId as string | undefined);
  if (scope.type === 'none') {
    res.json([]);
    return;
  }

  const where: Record<string, unknown> = { orgId };
  if (scope.type !== 'all') where.departmentId = { in: scope.departmentIds };
  if (cycle) where.cycle = cycle;
  if (reviewId) where.reviewId = reviewId;
  if (parentGoalId !== undefined) where.parentGoalId = parentGoalId === 'null' ? null : parentGoalId;

  const goals = await prisma.goal.findMany({
    where,
    include: goalInclude,
    orderBy: { targetDate: 'asc' },
  });
  res.json(goals);
});

// GET /goals/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const goal = await prisma.goal.findUnique({ where: { id: req.params.id as string, orgId }, include: goalInclude });
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  if (!(await canAccessDepartment(userId, orgId, role, goal.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(goal);
});

const createSchema = z.object({
  departmentId: z.string().min(1),
  cycle: z.enum(['STRATEGIC', 'TACTICAL']),
  title: z.string().min(2),
  description: z.string().optional(),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date(),
  reviewId: z.string().optional(),
  parentGoalId: z.string().optional(),
});

// POST /goals — set a 45-day Strategic goal, or a 15-day Tactical goal nested under one
router.post('/', auditLog('goal', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  if (!MUTATE_ROLES.includes(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { departmentId, cycle, parentGoalId } = parsed.data;

  if (!(await canAccessDepartment(userId, orgId, role, departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // The 15-day Tactical goal is always a checkpoint nested under a 45-day Strategic goal.
  if (cycle === 'TACTICAL') {
    if (!parentGoalId) {
      res.status(400).json({ error: 'A Tactical (15-day) goal must be linked to a parent Strategic (45-day) goal.' });
      return;
    }
    const parent = await prisma.goal.findFirst({
      where: { id: parentGoalId, orgId, departmentId },
      select: { id: true, cycle: true },
    });
    if (!parent || parent.cycle !== 'STRATEGIC') {
      res.status(400).json({ error: 'Parent goal must be a Strategic (45-day) goal in the same department.' });
      return;
    }
  } else if (parentGoalId) {
    res.status(400).json({ error: 'A Strategic (45-day) goal cannot have a parent goal.' });
    return;
  }

  const goal = await prisma.goal.create({
    data: {
      orgId,
      departmentId,
      cycle,
      title: parsed.data.title,
      description: parsed.data.description,
      startDate: parsed.data.startDate,
      targetDate: parsed.data.targetDate,
      reviewId: parsed.data.reviewId,
      parentGoalId: parsed.data.parentGoalId,
      createdByUserId: userId,
    },
    include: goalInclude,
  });

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    include: { users: { where: { status: 'ACTIVE' }, select: { id: true } } },
  });
  if (dept) {
    fanOutNotification(orgId, dept.users.map((u) => u.id), 'GOAL_SET', {
      departmentName: dept.name,
      goalTitle: goal.title,
      cycle: goal.cycle,
      targetDate: goal.targetDate.toISOString(),
    }).catch(console.error);
  }

  res.status(201).json(goal);
});

const updateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'ACHIEVED', 'MISSED', 'CARRIED_OVER']).optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
});

// PATCH /goals/:id
router.patch('/:id', auditLog('goal', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const existing = await prisma.goal.findUnique({ where: { id: req.params.id as string, orgId } });
  if (!existing) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  if (!MUTATE_ROLES.includes(role) || !(await canAccessDepartment(userId, orgId, role, existing.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const goal = await prisma.goal.update({
    where: { id: existing.id },
    data: parsed.data,
    include: goalInclude,
  });
  res.json(goal);
});

// DELETE /goals/:id — sub-goals are orphaned (parentGoalId set null), not cascade-deleted
router.delete('/:id', auditLog('goal', 'DELETE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const existing = await prisma.goal.findUnique({ where: { id: req.params.id as string, orgId } });
  if (!existing) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  if (!MUTATE_ROLES.includes(role) || !(await canAccessDepartment(userId, orgId, role, existing.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await prisma.goal.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

const goalAttachmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
});

// POST /goals/:id/attachments — attach a supporting document (uploaded separately via /upload/content)
router.post('/:id/attachments', auditLog('goal', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getGoalForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const parsed = goalAttachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const attachment = await prisma.goalAttachment.create({
    data: { goalId: result.goal.id, name: parsed.data.name, url: parsed.data.url, size: parsed.data.size },
  });

  res.status(201).json(attachment);
});

// DELETE /goals/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', auditLog('goal', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getGoalForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const attachment = await prisma.goalAttachment.findFirst({
    where: { id: req.params.attachmentId as string, goalId: result.goal.id },
    select: { id: true, url: true },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  await prisma.goalAttachment.delete({ where: { id: attachment.id } });
  if (attachment.url.includes('.amazonaws.com/')) {
    await deleteFromS3(attachment.url);
  }

  res.json({ success: true });
});

export default router;
