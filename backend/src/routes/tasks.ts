import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification, createNotification } from '../services/notification.service';
import { generateTaskSuggestions, generateStatusChangeSuggestions, enhanceTaskWithGemini } from '../services/ai.service';
import { sendTaskAssignedEmail } from '../services/email.service';
import { deleteFromS3 } from '../lib/s3';
import { getUserDeptAccess } from '../lib/deptAccess';

const APP_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

const router = Router();
router.use(authenticate);

async function getActorScope(userId: string, orgId: string) {
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

  const grant = await getUserDeptAccess(userId, orgId, actor.role);
  return { ...actor, reportIds, grant };
}

function canManageDepartmentScoped(role: string) {
  return ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(role);
}

async function canViewTask(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, task: {
  assigneeUserId: string | null;
  departmentId: string | null;
}) {
  if (['OWNER', 'COMPANY_ADMIN'].includes(actor.role)) return true;
  if (actor.role === 'TEAM_MEMBER') return task.assigneeUserId === actor.id;

  // Cross-dept grant check (applies to DEPARTMENT_HEAD and MANAGER)
  if (actor.grant?.accessType === 'FULL') return true;
  if (actor.grant?.accessType === 'SPECIFIC') {
    return task.departmentId !== null && actor.grant.departmentIds.includes(task.departmentId);
  }

  if (actor.role === 'MANAGER') {
    return task.assigneeUserId === actor.id ||
      (task.assigneeUserId !== null && actor.reportIds.includes(task.assigneeUserId)) ||
      (!!actor.departmentId && task.departmentId === actor.departmentId);
  }
  if (actor.role === 'DEPARTMENT_HEAD') {
    return !!actor.departmentId && task.departmentId === actor.departmentId;
  }
  return false;
}

async function canMutateTask(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, task: {
  assigneeUserId: string | null;
  departmentId: string | null;
}) {
  if (['OWNER', 'COMPANY_ADMIN'].includes(actor.role)) return true;
  if (actor.role === 'TEAM_MEMBER') return task.assigneeUserId === actor.id;

  // Cross-dept grant check
  if (actor.grant?.accessType === 'FULL') return true;
  if (actor.grant?.accessType === 'SPECIFIC') {
    return task.departmentId !== null && actor.grant.departmentIds.includes(task.departmentId);
  }

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
  departmentId: z.string().optional(),
  dependencyId: z.string().optional(),
  teamId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  recurrence: z.string().optional(),
  phaseId: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED']).optional(),
  blockerType: z.enum(['APPROVAL', 'CLIENT', 'DEPENDENCY', 'RESOURCE', 'UNCLEAR_REQUIREMENT', 'SYSTEM_ISSUE', 'OTHER']).optional(),
  blockerDescription: z.string().optional(),
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
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
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

// A submitted-for-review task goes to BOTH the assignee's manager and their
// department head (whichever exist) — either can approve it, not just a single
// fallback-chain reviewer.
async function getCompletionReviewers(taskId: string, orgId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId, orgId },
    select: {
      assigneeUserId: true,
      assignee: { select: { managerId: true } },
      department: { select: { headUserId: true } },
    },
  });
  if (!task) return [];

  const reviewers = new Set<string>();
  if (task.assignee?.managerId && task.assignee.managerId !== task.assigneeUserId) {
    reviewers.add(task.assignee.managerId);
  }
  if (task.department?.headUserId && task.department.headUserId !== task.assigneeUserId) {
    reviewers.add(task.department.headUserId);
  }
  return Array.from(reviewers);
}

// GET /tasks
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, assigneeUserId, status, priority, view } = req.query;

  const where: Record<string, unknown> = { orgId: req.user!.orgId };
  if (departmentId) where.departmentId = departmentId;
  if (assigneeUserId) where.assigneeUserId = assigneeUserId;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.user!.role === 'TEAM_MEMBER') {
    where.assigneeUserId = req.user!.userId;
  } else if (req.user!.role === 'MANAGER') {
    if (view === 'dept') {
      // Dept view: scope to granted or own dept
      if (actor.grant?.accessType === 'FULL') {
        // no extra filter
      } else if (actor.grant?.accessType === 'SPECIFIC') {
        where.departmentId = { in: actor.grant.departmentIds };
      } else if (actor.departmentId) {
        where.departmentId = actor.departmentId;
      } else {
        where.id = { in: [] }; // no dept, no grant — see nothing
      }
    } else {
      delete where.assigneeUserId;
      where.OR = [
        { assigneeUserId: { in: [req.user!.userId, ...actor.reportIds] } },
        { assignedByUserId: req.user!.userId, teamId: { not: null } },
      ];
    }
  } else if (req.user!.role === 'DEPARTMENT_HEAD') {
    if (actor.grant?.accessType === 'FULL') {
      // no extra filter — sees all dept tasks
    } else if (actor.grant?.accessType === 'SPECIFIC') {
      // Always include own dept alongside granted depts
      const deptIds = [...actor.grant.departmentIds];
      if (actor.departmentId && !deptIds.includes(actor.departmentId)) {
        deptIds.push(actor.departmentId);
      }
      where.departmentId = { in: deptIds };
    } else if (actor.departmentId) {
      where.departmentId = actor.departmentId;
    } else {
      where.id = { in: [] }; // no dept, no grant — see nothing
    }
  } else if (req.user!.role === 'COMPANY_ADMIN') {
    // getUserDeptAccess auto-returns FULL for COMPANY_ADMIN, so bypass it.
    // Look up the real DB grant to decide task visibility scope.
    const rawGrant = await prisma.userDepartmentGrant.findUnique({
      where: { userId: req.user!.userId },
      select: { accessType: true, departmentIds: true, orgId: true },
    });
    const explicitGrant = rawGrant?.orgId === req.user!.orgId ? rawGrant : null;

    if (explicitGrant?.accessType === 'FULL') {
      // explicitly granted full access — no filter
    } else if (explicitGrant?.accessType === 'SPECIFIC' && explicitGrant.departmentIds.length > 0) {
      const deptIds = [...explicitGrant.departmentIds];
      if (actor.departmentId && !deptIds.includes(actor.departmentId)) {
        deptIds.push(actor.departmentId);
      }
      where.departmentId = { in: deptIds };
    } else if (actor.departmentId) {
      where.departmentId = actor.departmentId;
    }
    // COMPANY_ADMIN with no dept and no explicit grant: sees all (they are org-wide admins)
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true, departmentId: true } },
      assignedBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, slug: true } },
      team: { select: { id: true, name: true } },
      dependency: { select: { id: true, title: true, status: true } },
      phase: true,
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
  });

  res.json(tasks);
});

// GET /tasks/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
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
      department: true,
      team: { select: { id: true, name: true } },
      dependency: { select: { id: true, title: true, status: true } },
      phase: true,
      comments: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: true,
      statusHistories: {
        include: {
          changedBy: { select: { id: true, name: true, avatarUrl: true } }
        },
        orderBy: { changedAt: 'desc' },
      },
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
  const canAssignToAnyone = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(req.user!.role);

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

  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (parsed.data.startDate && parsed.data.dueDate && new Date(parsed.data.startDate) > new Date(parsed.data.dueDate)) {
    res.status(400).json({ error: 'Start date must be before the end date.' });
    return;
  }

  // Resolve assignee (optional for elevated roles — they can leave it unassigned)
  let assignee: { id: string; name: string; email: string; departmentId: string | null; managerId: string | null } | null = null;
  if (parsed.data.assigneeUserId) {
    assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assigneeUserId, orgId: req.user!.orgId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, departmentId: true, managerId: true },
    });
    if (!assignee) {
      res.status(400).json({ error: 'Assignee not found' });
      return;
    }
  } else if (!canAssignToAnyone) {
    // Team members must always be assigned to themselves (already set above)
    res.status(400).json({ error: 'Assignee is required' });
    return;
  }

  // Always use the assignee's own departmentId as the task's department.
  // This prevents cross-dept assignment leaking into the wrong dept's task list.
  // Only fall back to the provided departmentId when there's no assignee.
  const resolvedDeptId = assignee?.departmentId ?? parsed.data.departmentId ?? undefined;

  // Validate phase-wise tasks for Engineering department projects
  if (parsed.data.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: parsed.data.teamId, orgId: req.user!.orgId },
      include: { department: true },
    });
    if (team && team.department && team.department.name.toLowerCase().includes('engineering')) {
      if (!parsed.data.phaseId) {
        res.status(400).json({ error: 'Engineering project tasks must belong to a phase.' });
        return;
      }
      const phase = await prisma.projectPhase.findFirst({
        where: { id: parsed.data.phaseId, teamId: team.id },
      });
      if (!phase) {
        res.status(400).json({ error: 'Selected phase does not belong to this project.' });
        return;
      }
      if (parsed.data.dueDate && new Date(parsed.data.dueDate) > new Date(phase.dueDate)) {
        res.status(400).json({ error: `Task end date cannot be beyond the Phase deadline (${phase.dueDate.toISOString().split('T')[0]}).` });
        return;
      }
    }
  }

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      departmentId: resolvedDeptId,
      orgId: req.user!.orgId,
      assignedByUserId: req.user!.userId,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });

  // Notify + email assignee (fire-and-forget, only if assigned to someone else)
  if (assignee && task.assigneeUserId && task.assigneeUserId !== req.user!.userId) {
    createNotification(task.assigneeUserId, 'TASK_ASSIGNED', {
      taskTitle: task.title,
      dueDate: task.dueDate?.toISOString().split('T')[0],
    }).catch(console.error);

    const assigner = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true },
    });
    sendTaskAssignedEmail({
      to: assignee.email,
      assigneeName: assignee.name,
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
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
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
      teamId: true,
      phaseId: true,
      title: true,
      description: true,
      priority: true,
      startDate: true,
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

  {
    const resolvedStartDate = parsed.data.startDate !== undefined ? parsed.data.startDate : existingTask.startDate?.toISOString();
    const resolvedDueDateForRange = parsed.data.dueDate !== undefined ? parsed.data.dueDate : existingTask.dueDate?.toISOString();
    if (resolvedStartDate && resolvedDueDateForRange && new Date(resolvedStartDate) > new Date(resolvedDueDateForRange)) {
      res.status(400).json({ error: 'Start date must be before the end date.' });
      return;
    }
  }

  // Validate phase-wise tasks for Engineering department projects
  const resolvedTeamId = parsed.data.teamId !== undefined ? parsed.data.teamId : existingTask.teamId;
  const resolvedPhaseId = parsed.data.phaseId !== undefined ? parsed.data.phaseId : existingTask.phaseId;

  if (resolvedTeamId) {
    const team = await prisma.team.findFirst({
      where: { id: resolvedTeamId, orgId: req.user!.orgId },
      include: { department: true },
    });
    if (team && team.department && team.department.name.toLowerCase().includes('engineering')) {
      if (!resolvedPhaseId) {
        res.status(400).json({ error: 'Engineering project tasks must belong to a phase.' });
        return;
      }
      const phase = await prisma.projectPhase.findFirst({
        where: { id: resolvedPhaseId, teamId: team.id },
      });
      if (!phase) {
        res.status(400).json({ error: 'Selected phase does not belong to this project.' });
        return;
      }
      const resolvedDueDate = parsed.data.dueDate !== undefined ? parsed.data.dueDate : existingTask.dueDate?.toISOString();
      if (resolvedDueDate && new Date(resolvedDueDate) > new Date(phase.dueDate)) {
        res.status(400).json({ error: `Task end date cannot be beyond the Phase deadline (${phase.dueDate.toISOString().split('T')[0]}).` });
        return;
      }
    }
  }

  if (actor.role === 'TEAM_MEMBER') {
    const forbiddenFields = ['assigneeUserId', 'departmentId', 'priority', 'dependencyId', 'dueDate', 'startDate'];
    if (forbiddenFields.some((field) => field in req.body)) {
      res.status(403).json({ error: 'Team members can only update title, description, status, and blocker details on their own tasks' });
      return;
    }
    // Team members CAN move a task into IN_REVIEW themselves now — this is the only
    // way they ever reach a "done" state; DONE is not a selectable option for them at
    // all (enforced below + hidden in the frontend dropdown). Same delivery-proof gate
    // applies either way (see isSubmittingOwnWork below).
  }

  const requestedStatus = parsed.data.status;

  // Validate assignee reassignment when provided
  let newAssigneeDeptId: string | null = null;
  if ('assigneeUserId' in parsed.data && parsed.data.assigneeUserId !== undefined) {
    if (parsed.data.assigneeUserId !== null) {
      const assignee = await prisma.user.findFirst({
        where: { id: parsed.data.assigneeUserId, orgId: req.user!.orgId, status: 'ACTIVE' },
        select: { id: true, name: true, email: true, departmentId: true, managerId: true },
      });
      if (!assignee) {
        res.status(400).json({ error: 'Assignee not found' });
        return;
      }
      newAssigneeDeptId = assignee.departmentId;
    }
    // OWNER, COMPANY_ADMIN, DEPARTMENT_HEAD, MANAGER can reassign to anyone
    // TEAM_MEMBER cannot change assignee at all (blocked above already)
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.assigneeUserId && parsed.data.assigneeUserId !== existingTask.assigneeUserId) {
    data.assignedByUserId = req.user!.userId;
    data.completionSubmittedAt = null;
    data.completionReviewedAt = null;
    data.completionReviewedByUserId = null;
    data.completedAt = null;
    // Re-scope task to the new assignee's department
    if (newAssigneeDeptId) data.departmentId = newAssigneeDeptId;
  }

  // Enforce delivery proof when submitting own work for review — whether they request
  // DONE (legacy path, still auto-rerouted below) or select IN_REVIEW directly (the only
  // way a TEAM_MEMBER can submit work now — DONE isn't offered to them at all).
  // Skip this check when approving someone else's IN_REVIEW task (that's a review, not a submission)
  const isSubmittingOwnWork =
    (requestedStatus === 'DONE' || requestedStatus === 'IN_REVIEW') &&
    existingTask.assigneeUserId === actor.id &&
    existingTask.status !== 'IN_REVIEW';
  if (isSubmittingOwnWork) {
    const deliveryCount = await prisma.taskAttachment.count({ where: { taskId: existingTask.id } });
    if (deliveryCount === 0) {
      res.status(400).json({ error: 'Please upload at least one delivery item (screenshot, document, or PR link) before submitting your work.' });
      return;
    }
  }

  const reviewerIds = (requestedStatus === 'DONE' || requestedStatus === 'IN_REVIEW')
    ? await getCompletionReviewers(existingTask.id, req.user!.orgId)
    : [];
  // Always route a TEAM_MEMBER's DONE-or-IN_REVIEW submission through the review gate,
  // regardless of whether any reviewer is found. reviewerIds is used only for notification —
  // missing reviewers must not bypass the gate.
  const shouldSubmitForReview = actor.role === 'TEAM_MEMBER'
    && (requestedStatus === 'DONE' || requestedStatus === 'IN_REVIEW')
    && existingTask.status !== 'IN_REVIEW';

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
      department: { select: { id: true, headUserId: true } },
    },
  });

  // Email new assignee when task is reassigned to a different person
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
      createNotification(newAssigneeId, 'TASK_ASSIGNED', {
        taskTitle: task.title,
        dueDate: task.dueDate?.toISOString().split('T')[0],
      }).catch(console.error);
    }
  }

  // Notify on block
  if (data.status === 'BLOCKED') {
    const notifyIds: string[] = [];
    if (task.assigneeUserId) notifyIds.push(task.assigneeUserId);
    if (task.department?.headUserId && task.department.headUserId !== task.assigneeUserId) {
      notifyIds.push(task.department.headUserId);
    }
    if (notifyIds.length) {
      fanOutNotification(req.user!.orgId, notifyIds, 'TASK_BLOCKED', {
        taskTitle: task.title, blockerType: data.blockerType as string,
      }).catch(console.error);
    }
  }

  if (shouldSubmitForReview && reviewerIds.length > 0) {
    fanOutNotification(req.user!.orgId, reviewerIds, 'TASK_SUBMITTED_FOR_REVIEW', {
      taskTitle: task.title,
      assigneeName: task.assignee?.name ?? 'Someone',
      taskId: task.id,
    }).catch(console.error);
  }

  // Capture status change history and generate suggestions/better options
  if (task.status !== existingTask.status) {
    try {
      const blockerDesc = parsed.data.blockerDescription || '';
      const suggestions = await generateStatusChangeSuggestions(task.id, task.status, req.user!.orgId, blockerDesc);
      await prisma.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: existingTask.status,
          toStatus: task.status,
          changedById: req.user!.userId,
          blockerType: parsed.data.blockerType || null,
          blockerDescription: blockerDesc || null,
          blockerExpectedResolution: parsed.data.blockerExpectedResolution ? new Date(parsed.data.blockerExpectedResolution) : null,
          suggestions: suggestions,
        }
      });
    } catch (err) {
      console.error('Error logging status transition history:', err);
    }
  }

  res.json(task);
});

// DELETE /tasks/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
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
    select: { id: true, url: true },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  await prisma.taskAttachment.delete({ where: { id: attachment.id } });

  if (attachment.url.includes('.amazonaws.com/')) {
    await deleteFromS3(attachment.url);
  }

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
      // Resolve assigneeEmail → assigneeUserId
      let assigneeUserId: string | undefined = row.assigneeUserId || undefined;
      if (!assigneeUserId && row.assigneeEmail) {
        const found = await prisma.user.findFirst({
          where: { email: row.assigneeEmail.trim().toLowerCase(), orgId: req.user!.orgId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!found) { results.errors.push(`Row "${row.title}": no active user found with email "${row.assigneeEmail}"`); continue; }
        assigneeUserId = found.id;
      }
      // Resolve departmentName/department → departmentId
      let departmentId: string | undefined = row.departmentId || undefined;
      const deptName = row.departmentName || row.department;
      if (!departmentId && deptName) {
        const found = await prisma.department.findFirst({
          where: { orgId: req.user!.orgId, isActive: true, name: { equals: deptName.trim(), mode: 'insensitive' } },
          select: { id: true },
        });
        if (!found) { results.errors.push(`Row "${row.title}": no department found with name "${deptName}"`); continue; }
        departmentId = found.id;
      }
      // Resolve projectName/project → teamId
      let teamId: string | undefined = row.teamId || undefined;
      const projName = row.projectName || row.project;
      if (!teamId && projName) {
        const found = await prisma.team.findFirst({
          where: { orgId: req.user!.orgId, isActive: true, name: { equals: projName.trim(), mode: 'insensitive' } },
          select: { id: true },
        });
        if (!found) { results.errors.push(`Row "${row.title}": no project found with name "${projName}"`); continue; }
        teamId = found.id;
      }
      const parsed = createSchema.safeParse({
        title: row.title,
        description: row.description || undefined,
        expectedOutcome: row.expectedOutcome || undefined,
        priority: row.priority?.toUpperCase() || 'MEDIUM',
        assigneeUserId,
        departmentId,
        teamId,
        // CSV template predates the start-date field — default to now for imported rows.
        startDate: row.startDate ? new Date(row.startDate).toISOString() : new Date().toISOString(),
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
        recurrence: row.recurrence?.toUpperCase() || undefined,
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

// POST /tasks/fix-dept — OWNER only: backfill departmentId on tasks that have none
// Derives department from the assignee's departmentId so existing data is properly scoped.
router.post('/fix-dept', async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'OWNER') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const nullDeptTasks = await prisma.task.findMany({
    where: { orgId: req.user!.orgId, departmentId: null, assigneeUserId: { not: null } },
    select: { id: true, assigneeUserId: true },
  });

  let fixed = 0;
  for (const task of nullDeptTasks) {
    if (!task.assigneeUserId) continue;
    const assignee = await prisma.user.findUnique({
      where: { id: task.assigneeUserId },
      select: { departmentId: true },
    });
    if (!assignee?.departmentId) continue;
    await prisma.task.update({
      where: { id: task.id },
      data: { departmentId: assignee.departmentId },
    });
    fixed++;
  }

  res.json({ fixed, total: nullDeptTasks.length });
});

// POST /tasks/enhance — use Gemini to improve task title and/or description
router.post('/enhance', async (req: AuthRequest, res: Response) => {
  const { title, description, field } = req.body as {
    title?: string;
    description?: string;
    field?: 'title' | 'description' | 'both';
  };
  if (!title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  try {
    const enhanced = await enhanceTaskWithGemini(
      title.trim(),
      description?.trim(),
      field ?? 'both'
    );
    res.json(enhanced);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI enhancement failed';
    res.status(500).json({ error: msg });
  }
});

export default router;
