import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification, createNotification } from '../services/notification.service';
import { generateTaskSuggestions } from '../services/ai.service';
import { sendTaskAssignedEmail } from '../services/email.service';

const APP_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

const router = Router();
router.use(authenticate);

async function getActorScope(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!actor) return null;

  let reportIds: string[] = [];
  if (actor.role === 'MANAGER') {
    const reports = await prisma.user.findMany({
      where: { managerId: actor.id },
      select: { id: true },
    });
    reportIds = reports.map((report) => report.id);
  }

  return { ...actor, reportIds };
}

function canManageDepartmentScoped(role: string) {
  return ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(role);
}

async function canViewTask(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, task: {
  assigneeUserId: string;
  departmentId: string | null;
}) {
  if (['OWNER', 'COMPANY_ADMIN'].includes(actor.role)) return true;
  if (actor.role === 'TEAM_MEMBER') return task.assigneeUserId === actor.id;
  if (actor.role === 'MANAGER') {
    return task.assigneeUserId === actor.id ||
      actor.reportIds.includes(task.assigneeUserId) ||
      (!!actor.departmentId && task.departmentId === actor.departmentId);
  }
  if (actor.role === 'DEPARTMENT_HEAD') {
    return !!actor.departmentId && task.departmentId === actor.departmentId;
  }
  return false;
}

async function canMutateTask(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, task: {
  assigneeUserId: string;
  departmentId: string | null;
}) {
  if (['OWNER', 'COMPANY_ADMIN'].includes(actor.role)) return true;
  if (actor.role === 'TEAM_MEMBER') return task.assigneeUserId === actor.id;
  if (actor.role === 'MANAGER') {
    return !!actor.departmentId && task.departmentId === actor.departmentId;
  }
  if (actor.role === 'DEPARTMENT_HEAD') {
    return !!actor.departmentId && task.departmentId === actor.departmentId;
  }
  return false;
}

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
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED']).optional(),
  blockerType: z.enum(['APPROVAL', 'CLIENT', 'DEPENDENCY', 'RESOURCE', 'UNCLEAR_REQUIREMENT', 'SYSTEM_ISSUE', 'OTHER']).optional(),
  blockerOwnerId: z.string().optional(),
  blockerExpectedResolution: z.string().datetime().optional(),
});

const taskAttachmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  type: z.enum(['SCREENSHOT', 'DOCUMENT', 'PULL_REQUEST']),
  size: z.number().int().nonnegative().optional(),
});

const taskPullRequestSchema = z.object({
  title: z.string().min(2),
  url: z.string().url(),
});

async function getTaskForMutation(req: AuthRequest, taskId: string) {
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    return { error: { status: 401, body: { error: 'Unauthorized' } } };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId, orgId: req.user!.orgId },
    select: { id: true, assigneeUserId: true, departmentId: true },
  });
  if (!task) {
    return { error: { status: 404, body: { error: 'Task not found' } } };
  }

  if (!(await canMutateTask(actor, task))) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { actor, task };
}

async function getCompletionReviewer(taskId: string, orgId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId, orgId },
    select: {
      assignedByUserId: true,
      assigneeUserId: true,
      assignee: { select: { managerId: true } },
      department: { select: { headUserId: true } },
    },
  });
  if (!task) return null;

  const reviewerId = task.assignedByUserId
    ?? task.assignee.managerId
    ?? task.department?.headUserId
    ?? null;

  if (!reviewerId || reviewerId === task.assigneeUserId) return null;
  return reviewerId;
}

// GET /tasks
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, assigneeUserId, status, priority, view } = req.query;

  const where: Record<string, unknown> = { orgId: req.user!.orgId };
  if (departmentId) where.departmentId = departmentId;
  if (assigneeUserId) where.assigneeUserId = assigneeUserId;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.user!.role === 'TEAM_MEMBER') {
    where.assigneeUserId = req.user!.userId;
  } else if (req.user!.role === 'MANAGER') {
    if (view === 'dept' && actor.departmentId) {
      where.departmentId = actor.departmentId;
    } else {
      where.assigneeUserId = { in: [req.user!.userId, ...actor.reportIds] };
    }
  } else if (req.user!.role === 'DEPARTMENT_HEAD' && actor.departmentId) {
    where.departmentId = actor.departmentId;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignedBy: { select: { id: true, name: true } },
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
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignedBy: { select: { id: true, name: true } },
      completionReviewedBy: { select: { id: true, name: true } },
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

  if (!(await canViewTask(actor, task))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(task);
});

// POST /tasks
router.post('/', auditLog('task', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const isTeamMember = req.user!.role === 'TEAM_MEMBER';

  if (!canManageDepartmentScoped(req.user!.role) && !isTeamMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Team members can only create tasks assigned to themselves
  if (isTeamMember) {
    req.body.assigneeUserId = req.user!.userId;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: parsed.data.assigneeUserId,
      orgId: req.user!.orgId,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true, departmentId: true, managerId: true },
  });
  if (!assignee) {
    res.status(400).json({ error: 'Assignee not found' });
    return;
  }

  if (parsed.data.departmentId && assignee.departmentId && parsed.data.departmentId !== assignee.departmentId) {
    res.status(400).json({ error: 'Assignee must belong to the selected department' });
    return;
  }

  if (!isTeamMember && actor.role === 'DEPARTMENT_HEAD') {
    if (!actor.departmentId || parsed.data.departmentId !== actor.departmentId || assignee.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Department heads can only assign tasks within their department' });
      return;
    }
  }

  if (!isTeamMember && actor.role === 'MANAGER') {
    const inOwnDept = !!actor.departmentId && parsed.data.departmentId === actor.departmentId && assignee.departmentId === actor.departmentId;
    const assignableUser = assignee.id === actor.id || assignee.managerId === actor.id;
    if (!inOwnDept || !assignableUser) {
      res.status(403).json({ error: 'Managers can only assign tasks to themselves or their direct reports in their department' });
      return;
    }
  }

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      orgId: req.user!.orgId,
      assignedByUserId: isTeamMember ? null : req.user!.userId,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });

  // Notify + email assignee (fire-and-forget)
  if (task.assigneeUserId !== req.user!.userId) {
    createNotification(task.assigneeUserId, 'TASK_ASSIGNED', {
      taskTitle: task.title,
      dueDate: task.dueDate?.toISOString().split('T')[0],
    }).catch(console.error);

    const assigner = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true },
    });
    sendTaskAssignedEmail({
      to: assignee!.email,
      assigneeName: assignee!.name,
      assignedByName: assigner?.name ?? 'Your manager',
      taskTitle: task.title,
      taskDescription: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      appUrl: APP_URL,
    }).catch(console.error);
  }

  res.status(201).json(task);
});

// PATCH /tasks/:id
router.patch('/:id', auditLog('task', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existingTask = await prisma.task.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: {
      id: true,
      assigneeUserId: true,
      assignedByUserId: true,
      departmentId: true,
      title: true,
      description: true,
      priority: true,
      dueDate: true,
      status: true,
      completionSubmittedAt: true,
      assignee: { select: { id: true, name: true, managerId: true } },
      department: { select: { id: true, headUserId: true } },
    },
  });
  if (!existingTask) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!(await canMutateTask(actor, existingTask))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (actor.role === 'TEAM_MEMBER') {
    const forbiddenFields = ['assigneeUserId', 'departmentId', 'kraId', 'priority', 'dependencyId', 'dueDate', 'startDate', 'title'];
    if (forbiddenFields.some((field) => field in req.body)) {
      res.status(403).json({ error: 'Team members can only update status and blocker details on their own tasks' });
      return;
    }
    if (parsed.data.status === 'IN_REVIEW') {
      res.status(403).json({ error: 'Team members cannot move tasks directly into review' });
      return;
    }
  }

  const requestedStatus = parsed.data.status;

  if (parsed.data.assigneeUserId || parsed.data.departmentId) {
    const nextDepartmentId = parsed.data.departmentId ?? existingTask.departmentId ?? undefined;
    const nextAssigneeId = parsed.data.assigneeUserId ?? existingTask.assigneeUserId;
    const assignee = await prisma.user.findFirst({
      where: { id: nextAssigneeId, orgId: req.user!.orgId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, departmentId: true, managerId: true },
    });
    if (!assignee) {
      res.status(400).json({ error: 'Assignee not found' });
      return;
    }

    if (nextDepartmentId && assignee.departmentId && nextDepartmentId !== assignee.departmentId) {
      res.status(400).json({ error: 'Assignee must belong to the selected department' });
      return;
    }

    if (actor.role === 'DEPARTMENT_HEAD') {
      if (!actor.departmentId || nextDepartmentId !== actor.departmentId || assignee.departmentId !== actor.departmentId) {
        res.status(403).json({ error: 'Department heads can only manage task assignment within their department' });
        return;
      }
    }

    if (actor.role === 'MANAGER') {
      const inOwnDept = !!actor.departmentId && nextDepartmentId === actor.departmentId && assignee.departmentId === actor.departmentId;
      const assignableUser = assignee.id === actor.id || assignee.managerId === actor.id;
      if (!inOwnDept || !assignableUser) {
        res.status(403).json({ error: 'Managers can only reassign tasks to themselves or their direct reports in their department' });
        return;
      }
    }
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.assigneeUserId && parsed.data.assigneeUserId !== existingTask.assigneeUserId) {
    data.assignedByUserId = req.user!.userId;
    data.completionSubmittedAt = null;
    data.completionReviewedAt = null;
    data.completionReviewedByUserId = null;
    data.completedAt = null;
  }

  const reviewerId = requestedStatus === 'DONE'
    ? await getCompletionReviewer(existingTask.id, req.user!.orgId)
    : null;
  const shouldSubmitForReview = actor.role === 'TEAM_MEMBER' && requestedStatus === 'DONE' && !!reviewerId;

  if (shouldSubmitForReview) {
    data.status = 'IN_REVIEW';
    data.completedAt = null;
    data.completionSubmittedAt = new Date();
    data.completionReviewedAt = null;
    data.completionReviewedByUserId = null;
  } else if (requestedStatus === 'DONE') {
    data.completedAt = new Date();
    if (existingTask.status === 'IN_REVIEW') {
      data.completionReviewedAt = new Date();
      data.completionReviewedByUserId = req.user!.userId;
    }
  } else if (requestedStatus) {
    data.completedAt = null;
    if (requestedStatus !== 'IN_REVIEW') {
      data.completionSubmittedAt = null;
      data.completionReviewedAt = null;
      data.completionReviewedByUserId = null;
    }
  }

  if (data.status === 'BLOCKED') data.blockerCount = { increment: 1 };

  const task = await prisma.task.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
    include: {
      assignee: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
      kra: { select: { id: true, target: true, current: true } },
      department: { select: { id: true, headUserId: true } },
    },
  });

  // KRA progress rollup
  if (data.status === 'DONE' && existingTask.status !== 'DONE' && task.kraId && task.kra) {
    const kra = task.kra as { id: string; target: number; current: number };
    const newCurrent = Math.min(kra.current + 1, kra.target);
    await prisma.kRA.update({
      where: { id: task.kraId },
      data: { current: newCurrent, status: newCurrent >= kra.target ? 'COMPLETED' : 'ON_TRACK' },
    });
  }

  // Email new assignee when task is reassigned to someone else
  const newAssigneeId = parsed.data.assigneeUserId;
  if (newAssigneeId && newAssigneeId !== existingTask!.assigneeUserId && newAssigneeId !== req.user!.userId) {
    const [newAssignee, assigner] = await Promise.all([
      prisma.user.findUnique({ where: { id: newAssigneeId }, select: { name: true, email: true } }),
      prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } }),
    ]);
    if (newAssignee) {
      sendTaskAssignedEmail({
        to: newAssignee.email,
        assigneeName: newAssignee.name,
        assignedByName: assigner?.name ?? 'Your manager',
        taskTitle: task.title,
        taskDescription: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        appUrl: APP_URL,
      }).catch(console.error);
    }
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

  if (shouldSubmitForReview && reviewerId) {
    createNotification(reviewerId, 'TASK_SUBMITTED_FOR_REVIEW', {
      taskTitle: task.title,
      assigneeName: task.assignee.name,
      taskId: task.id,
    }).catch(console.error);
  }

  res.json(task);
});

// DELETE /tasks/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const existingTask = await prisma.task.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, assigneeUserId: true, departmentId: true },
  });
  if (!existingTask) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  if (!(await canMutateTask(actor, existingTask)) || actor.role === 'TEAM_MEMBER') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await prisma.task.delete({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
  });
  res.json({ success: true });
});

// POST /tasks/:id/attachments
router.post('/:id/attachments', auditLog('task', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getTaskForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const parsed = taskAttachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: result.task.id,
      name: parsed.data.name,
      url: parsed.data.url,
      type: parsed.data.type,
      size: parsed.data.size,
    },
  });

  res.status(201).json(attachment);
});

// POST /tasks/:id/pull-requests
router.post('/:id/pull-requests', auditLog('task', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getTaskForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const parsed = taskPullRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: result.task.id,
      name: parsed.data.title,
      url: parsed.data.url,
      type: 'PULL_REQUEST',
    },
  });

  res.status(201).json(attachment);
});

// DELETE /tasks/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', auditLog('task', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getTaskForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const attachment = await prisma.taskAttachment.findFirst({
    where: {
      id: req.params.attachmentId as string,
      taskId: result.task.id,
    },
    select: { id: true },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  await prisma.taskAttachment.delete({ where: { id: attachment.id } });
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

// GET /tasks/:id/ai-suggestions — M4.7: AI next-step suggestions for blocked task
router.get('/:id/ai-suggestions', async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, status: true },
  });
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  if (task.status !== 'BLOCKED') { res.status(400).json({ error: 'Task is not blocked' }); return; }

  const suggestions = await generateTaskSuggestions(task.id, req.user!.orgId);
  res.json({ suggestions });
});

// POST /tasks/import-csv
router.post('/import-csv', auditLog('task', 'CREATE'), async (req: AuthRequest, res: Response) => {
  if (!['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
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
      await prisma.task.create({ data: { ...parsed.data, orgId: req.user!.orgId, assignedByUserId: req.user!.userId } });
      results.created++;
    } catch (e) {
      results.errors.push(`Row "${row.title}": ${(e as Error).message}`);
    }
  }

  res.json(results);
});

export default router;
