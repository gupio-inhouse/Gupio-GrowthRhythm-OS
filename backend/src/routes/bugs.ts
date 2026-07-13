import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification, createNotification } from '../services/notification.service';
import { deleteFromS3 } from '../lib/s3';
import { getUserDeptAccess } from '../lib/deptAccess';

// Bug Tracker access is intentionally narrower than Tasks — no COMPANY_ADMIN,
// no SUPER_ADMIN/COACH_ADVISOR. Only these roles can use the feature at all.
const ALLOWED_ROLES = ['OWNER', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'];

const router = Router();
router.use(authenticate);
router.use((req: AuthRequest, res: Response, next) => {
  if (!ALLOWED_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
});

function isEngineeringDeptName(name?: string | null) {
  return !!name && name.toLowerCase().includes('engineering');
}

async function getActorScope(userId: string, orgId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true, bugTrackerFullAccess: true },
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

function canViewBug(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, bug: {
  reporterUserId: string;
  assigneeUserId: string | null;
  departmentId: string;
}) {
  if (actor.role === 'OWNER') return true;

  // Dedicated, feature-scoped grant — toggled per-user via GET/PATCH /bugs/access/*
  // (OWNER only). This is how a specific TEAM_MEMBER (e.g. a tester) gets
  // department-head-equivalent bug visibility WITHOUT the broader UserDepartmentGrant
  // (cross-department access to Tasks/etc.) — deliberately kept separate from that.
  if (actor.bugTrackerFullAccess) return true;

  // UserDepartmentGrant still applies for MANAGER/DEPARTMENT_HEAD's existing cross-dept
  // access use case — unrelated to the per-user Bug Tracker flag above.
  if (actor.grant?.accessType === 'FULL') return true;
  if (actor.grant?.accessType === 'SPECIFIC') {
    return actor.grant.departmentIds.includes(bug.departmentId);
  }

  // Team members only see bugs assigned to them — not ones they merely reported.
  if (actor.role === 'TEAM_MEMBER') {
    return bug.assigneeUserId === actor.id;
  }

  if (actor.role === 'MANAGER') {
    return bug.reporterUserId === actor.id ||
      bug.assigneeUserId === actor.id ||
      actor.reportIds.includes(bug.reporterUserId) ||
      (bug.assigneeUserId !== null && actor.reportIds.includes(bug.assigneeUserId)) ||
      (!!actor.departmentId && bug.departmentId === actor.departmentId);
  }
  if (actor.role === 'DEPARTMENT_HEAD') {
    return !!actor.departmentId && bug.departmentId === actor.departmentId;
  }
  return false;
}

function canMutateBug(actor: NonNullable<Awaited<ReturnType<typeof getActorScope>>>, bug: {
  reporterUserId: string;
  assigneeUserId: string | null;
  departmentId: string;
}) {
  if (actor.role === 'OWNER') return true;

  // See canViewBug's comment — the dedicated flag elevates a TEAM_MEMBER to
  // dept-head-equivalent mutate access too (status changes, reassignment, comments, attachments).
  if (actor.bugTrackerFullAccess) return true;

  if (actor.grant?.accessType === 'FULL') return true;
  if (actor.grant?.accessType === 'SPECIFIC') {
    return actor.grant.departmentIds.includes(bug.departmentId);
  }

  // Team members only mutate bugs assigned to them — not ones they merely reported.
  if (actor.role === 'TEAM_MEMBER') {
    return bug.assigneeUserId === actor.id;
  }

  if (actor.role === 'MANAGER' || actor.role === 'DEPARTMENT_HEAD') {
    return !!actor.departmentId && bug.departmentId === actor.departmentId;
  }
  return false;
}

const CLOSED_STATUSES = ['FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  environment: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  teamId: z.string().min(1),
  assigneeUserId: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'FIXED', 'REOPENED', 'CLOSED', 'WONT_FIX', 'DUPLICATE']).optional(),
  note: z.string().optional(),
});

const bugAttachmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  type: z.enum(['SCREENSHOT', 'DOCUMENT', 'PULL_REQUEST']),
  size: z.number().int().nonnegative().optional(),
});

async function resolveEngineeringTeam(teamId: string, orgId: string) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, orgId },
    include: { department: true },
  });
  if (!team || !team.department || !isEngineeringDeptName(team.department.name)) {
    return null;
  }
  return team;
}

async function getBugForMutation(req: AuthRequest, bugId: string) {
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    return { error: { status: 401, body: { error: 'Unauthorized' } } };
  }

  const bug = await prisma.bug.findUnique({
    where: { id: bugId, orgId: req.user!.orgId },
    select: { id: true, reporterUserId: true, assigneeUserId: true, departmentId: true },
  });
  if (!bug) {
    return { error: { status: 404, body: { error: 'Bug not found' } } };
  }

  if (!canMutateBug(actor, bug)) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { actor, bug };
}

// GET /bugs/access/members — OWNER only: list Engineering-department users + their
// Bug Tracker full-access flag, for the "Manage Bug Access" panel.
router.get('/access/members', requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  const members = await prisma.user.findMany({
    where: {
      orgId: req.user!.orgId,
      status: 'ACTIVE',
      department: { name: { contains: 'engineering', mode: 'insensitive' } },
    },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, bugTrackerFullAccess: true },
    orderBy: { name: 'asc' },
  });
  res.json(members);
});

// PATCH /bugs/access/:userId — OWNER only: grant/revoke full Bug Tracker access for one user.
router.patch('/access/:userId', requireRole('OWNER'), auditLog('bug_tracker_access', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const { fullAccess } = req.body as { fullAccess?: boolean };
  if (typeof fullAccess !== 'boolean') {
    res.status(400).json({ error: 'fullAccess (boolean) is required' });
    return;
  }

  const target = await prisma.user.findFirst({
    where: { id: req.params.userId as string, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { bugTrackerFullAccess: fullAccess },
    select: { id: true, name: true, bugTrackerFullAccess: true },
  });

  res.json(updated);
});

// GET /bugs
router.get('/', async (req: AuthRequest, res: Response) => {
  const { teamId, status, severity, assigneeUserId, reporterUserId, view } = req.query;

  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const where: Record<string, unknown> = { orgId: req.user!.orgId };
  if (teamId) where.teamId = teamId;
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (assigneeUserId) where.assigneeUserId = assigneeUserId;
  if (reporterUserId) where.reporterUserId = reporterUserId;

  // Dedicated per-user flag (OWNER-managed via /bugs/access/*) overrides default role
  // scoping — this is how a specific TEAM_MEMBER (e.g. a tester) gets department-head-
  // equivalent bug visibility without the broader UserDepartmentGrant.
  if (actor.bugTrackerFullAccess) {
    // no extra filter — sees all bugs org-wide, same as OWNER
  } else if (actor.grant?.accessType === 'FULL') {
    // no extra filter — sees all bugs org-wide, same as OWNER
  } else if (actor.grant?.accessType === 'SPECIFIC') {
    const deptIds = [...actor.grant.departmentIds];
    if (actor.departmentId && !deptIds.includes(actor.departmentId)) deptIds.push(actor.departmentId);
    where.departmentId = { in: deptIds };
  } else if (actor.role === 'TEAM_MEMBER') {
    where.assigneeUserId = actor.id;
  } else if (actor.role === 'MANAGER') {
    if (view === 'dept') {
      if (actor.departmentId) {
        where.departmentId = actor.departmentId;
      } else {
        where.id = { in: [] };
      }
    } else {
      where.OR = [
        { reporterUserId: actor.id },
        { assigneeUserId: actor.id },
        { reporterUserId: { in: actor.reportIds } },
        { assigneeUserId: { in: actor.reportIds } },
      ];
    }
  } else if (actor.role === 'DEPARTMENT_HEAD') {
    if (actor.departmentId) {
      where.departmentId = actor.departmentId;
    } else {
      where.id = { in: [] };
    }
  }
  // OWNER: no extra filter — sees all bugs org-wide.

  const bugs = await prisma.bug.findMany({
    where,
    include: {
      reporter: { select: { id: true, name: true, avatarUrl: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      assignedBy: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, slug: true } },
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });

  res.json(bugs);
});

// GET /bugs/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bug = await prisma.bug.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: {
      reporter: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignedBy: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      department: true,
      comments: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: true,
      statusHistories: {
        include: { changedBy: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { changedAt: 'desc' },
      },
    },
  });

  if (!bug) {
    res.status(404).json({ error: 'Bug not found' });
    return;
  }
  if (!canViewBug(actor, bug)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(bug);
});

// POST /bugs
router.post('/', auditLog('bug', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const team = await resolveEngineeringTeam(parsed.data.teamId, req.user!.orgId);
  if (!team) {
    res.status(400).json({ error: 'Bugs can only be reported against an Engineering project.' });
    return;
  }

  let assignee: { id: string; name: string; email: string } | null = null;
  if (parsed.data.assigneeUserId) {
    assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assigneeUserId, orgId: req.user!.orgId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
    });
    if (!assignee) {
      res.status(400).json({ error: 'Assignee not found' });
      return;
    }
  }

  const bug = await prisma.bug.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      stepsToReproduce: parsed.data.stepsToReproduce,
      expectedBehavior: parsed.data.expectedBehavior,
      actualBehavior: parsed.data.actualBehavior,
      environment: parsed.data.environment,
      severity: parsed.data.severity,
      orgId: req.user!.orgId,
      teamId: team.id,
      departmentId: team.departmentId,
      reporterUserId: req.user!.userId,
      assigneeUserId: assignee?.id,
      assignedByUserId: assignee ? req.user!.userId : undefined,
    },
    include: {
      reporter: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (assignee && assignee.id !== req.user!.userId) {
    createNotification(assignee.id, 'BUG_ASSIGNED', {
      bugTitle: bug.title,
      projectName: bug.team.name,
      assignedByName: bug.reporter.name,
    }).catch(console.error);
  }

  res.status(201).json(bug);
});

// PATCH /bugs/:id
router.patch('/:id', auditLog('bug', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await getBugForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }
  const { actor, bug: existingBug } = result;

  const existing = await prisma.bug.findUnique({
    where: { id: existingBug.id },
    select: { id: true, status: true, teamId: true, departmentId: true, title: true, reporterUserId: true, assigneeUserId: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Bug not found' });
    return;
  }

  // Resolve project reassignment (must stay within Engineering)
  let teamUpdate: { teamId: string; departmentId: string } | null = null;
  if (parsed.data.teamId && parsed.data.teamId !== existing.teamId) {
    const team = await resolveEngineeringTeam(parsed.data.teamId, req.user!.orgId);
    if (!team) {
      res.status(400).json({ error: 'Bugs can only be reported against an Engineering project.' });
      return;
    }
    teamUpdate = { teamId: team.id, departmentId: team.departmentId };
  }

  let newAssignee: { id: string; name: string; email: string } | null = null;
  if ('assigneeUserId' in parsed.data && parsed.data.assigneeUserId !== undefined && parsed.data.assigneeUserId !== existing.assigneeUserId) {
    newAssignee = await prisma.user.findFirst({
      where: { id: parsed.data.assigneeUserId, orgId: req.user!.orgId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
    });
    if (!newAssignee) {
      res.status(400).json({ error: 'Assignee not found' });
      return;
    }
  }

  const data: Record<string, unknown> = { ...parsed.data };
  delete data.note;
  if (teamUpdate) Object.assign(data, teamUpdate);
  if (newAssignee) data.assignedByUserId = req.user!.userId;

  const requestedStatus = parsed.data.status;
  if (requestedStatus) {
    if (CLOSED_STATUSES.includes(requestedStatus) && !CLOSED_STATUSES.includes(existing.status)) {
      data.resolvedAt = new Date();
    }
    if (requestedStatus === 'CLOSED') data.closedAt = new Date();
    if (!CLOSED_STATUSES.includes(requestedStatus)) {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }

  const bug = await prisma.bug.update({
    where: { id: existing.id },
    data,
    include: {
      reporter: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (newAssignee && newAssignee.id !== req.user!.userId) {
    createNotification(newAssignee.id, 'BUG_ASSIGNED', {
      bugTitle: bug.title,
      projectName: bug.team.name,
      assignedByName: actor.id === existing.reporterUserId ? bug.reporter.name : 'A teammate',
    }).catch(console.error);
  }

  if (requestedStatus && requestedStatus !== existing.status) {
    const notifyIds = new Set<string>();
    if (bug.reporterUserId && bug.reporterUserId !== req.user!.userId) notifyIds.add(bug.reporterUserId);
    if (bug.assigneeUserId && bug.assigneeUserId !== req.user!.userId) notifyIds.add(bug.assigneeUserId);

    if (requestedStatus === 'REOPENED' && notifyIds.size > 0) {
      fanOutNotification(req.user!.orgId, Array.from(notifyIds), 'BUG_REOPENED', {
        bugTitle: bug.title,
        reopenedByName: actor.id === existing.reporterUserId ? bug.reporter.name : 'A teammate',
      }).catch(console.error);
    } else if (notifyIds.size > 0) {
      fanOutNotification(req.user!.orgId, Array.from(notifyIds), 'BUG_STATUS_CHANGED', {
        bugTitle: bug.title,
        toStatus: requestedStatus,
      }).catch(console.error);
    }

    await prisma.bugStatusHistory.create({
      data: {
        bugId: bug.id,
        fromStatus: existing.status,
        toStatus: requestedStatus,
        changedById: req.user!.userId,
        note: parsed.data.note || null,
      },
    });
  }

  res.json(bug);
});

// DELETE /bugs/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId, req.user!.orgId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (actor.role === 'TEAM_MEMBER') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const bug = await prisma.bug.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, reporterUserId: true, assigneeUserId: true, departmentId: true },
  });
  if (!bug) {
    res.status(404).json({ error: 'Bug not found' });
    return;
  }
  if (!canMutateBug(actor, bug)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await prisma.bug.delete({ where: { id: bug.id } });
  res.json({ success: true });
});

// POST /bugs/:id/comments
router.post('/:id/comments', async (req: AuthRequest, res: Response) => {
  const result = await getBugForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content required' });
    return;
  }

  const comment = await prisma.bugComment.create({
    data: { bugId: result.bug.id, userId: req.user!.userId, content },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const notifyIds = new Set<string>();
  if (result.bug.reporterUserId && result.bug.reporterUserId !== req.user!.userId) notifyIds.add(result.bug.reporterUserId);
  if (result.bug.assigneeUserId && result.bug.assigneeUserId !== req.user!.userId) notifyIds.add(result.bug.assigneeUserId);
  if (notifyIds.size > 0) {
    const bugTitle = (await prisma.bug.findUnique({ where: { id: result.bug.id }, select: { title: true } }))?.title || 'a bug';
    fanOutNotification(req.user!.orgId, Array.from(notifyIds), 'BUG_COMMENT_ADDED', {
      bugTitle,
      commenterName: comment.user.name,
    }).catch(console.error);
  }

  res.status(201).json(comment);
});

// POST /bugs/:id/attachments
router.post('/:id/attachments', auditLog('bug', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getBugForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const parsed = bugAttachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const attachment = await prisma.bugAttachment.create({
    data: {
      bugId: result.bug.id,
      name: parsed.data.name,
      url: parsed.data.url,
      type: parsed.data.type,
      size: parsed.data.size,
    },
  });

  res.status(201).json(attachment);
});

// DELETE /bugs/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', auditLog('bug', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const result = await getBugForMutation(req, req.params.id as string);
  if (result.error) {
    res.status(result.error.status).json(result.error.body);
    return;
  }

  const attachment = await prisma.bugAttachment.findFirst({
    where: { id: req.params.attachmentId as string, bugId: result.bug.id },
    select: { id: true, url: true },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  await prisma.bugAttachment.delete({ where: { id: attachment.id } });
  if (attachment.url.includes('.amazonaws.com/')) {
    await deleteFromS3(attachment.url);
  }

  res.json({ success: true });
});

export default router;
