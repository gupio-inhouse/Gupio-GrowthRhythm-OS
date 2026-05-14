import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification, createNotification } from '../services/notification.service';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  kraId: z.string().optional(),
  departmentId: z.string().optional(),
  dependencyId: z.string().optional(),
  assigneeUserId: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  isLearningTask: z.boolean().default(false),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).optional(),
  blockerType: z.enum(['APPROVAL', 'CLIENT', 'DEPENDENCY', 'RESOURCE', 'UNCLEAR_REQUIREMENT', 'SYSTEM_ISSUE', 'OTHER']).optional(),
  blockerOwnerId: z.string().optional(),
  blockerExpectedResolution: z.string().datetime().optional(),
});

// GET /tasks
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, assigneeUserId, status, priority, view } = req.query;

  const where: Record<string, unknown> = { orgId: req.user!.orgId };
  if (departmentId) where.departmentId = departmentId;
  if (assigneeUserId) where.assigneeUserId = assigneeUserId;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  // Managers see own department, team members see own tasks
  if (req.user!.role === 'TEAM_MEMBER' && view !== 'dept') {
    where.assigneeUserId = req.user!.userId;
  } else if (req.user!.role === 'MANAGER' && view !== 'dept') {
    // Manager sees tasks assigned to their direct reports + themselves
    const reports = await prisma.user.findMany({
      where: { managerId: req.user!.userId },
      select: { id: true },
    });
    where.assigneeUserId = { in: [req.user!.userId, ...reports.map((r) => r.id)] };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      kra: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, slug: true } },
      dependency: { select: { id: true, title: true, status: true } },
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
  });

  res.json(tasks);
});

// GET /tasks/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      kra: true,
      department: true,
      dependency: { select: { id: true, title: true, status: true } },
      comments: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: true,
    },
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// POST /tasks
router.post('/', auditLog('task', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const task = await prisma.task.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { assignee: { select: { id: true, name: true } } },
  });

  // Notify assignee (fire-and-forget)
  if (task.assigneeUserId !== req.user!.userId) {
    createNotification(task.assigneeUserId, 'TASK_ASSIGNED', {
      taskTitle: task.title,
      dueDate: task.dueDate?.toISOString().split('T')[0],
    }).catch(console.error);
  }

  res.status(201).json(task);
});

// PATCH /tasks/:id
router.patch('/:id', auditLog('task', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (data.status === 'DONE') data.completedAt = new Date();
  if (data.status === 'BLOCKED') data.blockerCount = { increment: 1 };

  const task = await prisma.task.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
    include: {
      assignee: { select: { id: true, name: true } },
      kra: { select: { id: true, target: true, current: true } },
      department: { select: { id: true, headUserId: true } },
    },
  });

  // KRA progress rollup
  if (data.status === 'DONE' && task.kraId && task.kra) {
    const kra = task.kra as { id: string; target: number; current: number };
    const newCurrent = Math.min(kra.current + 1, kra.target);
    await prisma.kRA.update({
      where: { id: task.kraId },
      data: { current: newCurrent, status: newCurrent >= kra.target ? 'COMPLETED' : 'ON_TRACK' },
    });
  }

  // Notify on block
  if (data.status === 'BLOCKED') {
    const notifyIds = [task.assigneeUserId];
    if (task.department?.headUserId && task.department.headUserId !== task.assigneeUserId) {
      notifyIds.push(task.department.headUserId);
    }
    fanOutNotification(req.user!.orgId, notifyIds, 'TASK_BLOCKED', {
      taskTitle: task.title, blockerType: data.blockerType as string,
    }).catch(console.error);
  }

  res.json(task);
});

// DELETE /tasks/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.task.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: { status: 'CANCELLED' },
  });
  res.json({ success: true });
});

// POST /tasks/:id/comments
router.post('/:id/comments', async (req: AuthRequest, res: Response) => {
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: 'Content required' }); return; }

  const comment = await prisma.taskComment.create({
    data: { taskId: req.params.id as string, userId: req.user!.userId, content },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  res.status(201).json(comment);
});

// POST /tasks/import-csv
router.post('/import-csv', auditLog('task', 'IMPORT'), async (req: AuthRequest, res: Response) => {
  const { rows } = req.body as { rows: Array<Record<string, string>> };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows array required' });
    return;
  }

  const results: { created: number; errors: string[] } = { created: 0, errors: [] };

  for (const row of rows.slice(0, 500)) {
    try {
      const parsed = createSchema.safeParse({
        title: row.title,
        description: row.description,
        priority: row.priority?.toUpperCase() || 'MEDIUM',
        assigneeUserId: row.assigneeUserId,
        departmentId: row.departmentId || undefined,
        kraId: row.kraId || undefined,
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
      });
      if (!parsed.success) { results.errors.push(`Row "${row.title}": ${JSON.stringify(parsed.error.flatten().fieldErrors)}`); continue; }
      await prisma.task.create({ data: { ...parsed.data, orgId: req.user!.orgId } });
      results.created++;
    } catch (e) {
      results.errors.push(`Row "${row.title}": ${(e as Error).message}`);
    }
  }

  res.json(results);
});

export default router;
