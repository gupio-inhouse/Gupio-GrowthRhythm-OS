import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  kraId: z.string().optional(),
  departmentId: z.string().optional(),
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

  // My tasks view — only own tasks for team members
  if (req.user!.role === 'TEAM_MEMBER' && view !== 'dept') {
    where.assigneeUserId = req.user!.userId;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      kra: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, slug: true } },
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
        include: { },
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
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const task = await prisma.task.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
    include: { assignee: { select: { id: true, name: true } } },
  });

  res.status(201).json(task);
});

// PATCH /tasks/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (data.status === 'DONE') data.completedAt = new Date();

  const task = await prisma.task.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
    include: { assignee: { select: { id: true, name: true } } },
  });

  // If blockerCount threshold hit, we'd trigger escalation job here
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
  if (!content) {
    res.status(400).json({ error: 'Content required' });
    return;
  }

  const comment = await prisma.taskComment.create({
    data: { taskId: req.params.id as string, userId: req.user!.userId, content },
  });

  res.status(201).json(comment);
});

export default router;
