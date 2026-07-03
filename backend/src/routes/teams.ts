import { Router, Response } from 'express';
import { z } from 'zod';
import { callGroq } from '../services/ai.service';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { getUserDeptAccess } from '../lib/deptAccess';

const router = Router();
router.use(authenticate);

const memberSelect = {
  id: true, name: true, email: true, avatarUrl: true, role: true,
};

const teamInclude = {
  department: { select: { id: true, name: true, slug: true } },
  manager: { select: memberSelect },
  departmentHead: { select: memberSelect },
  members: {
    include: { user: { select: memberSelect } },
    orderBy: { joinedAt: 'asc' as const },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTeam(team: any) {
  return { ...team, memberCount: (team.members ?? []).length };
}

async function assertDeptAccess(role: string, userId: string, orgId: string, departmentId: string) {
  if (['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role)) return true;
  if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER') {
    const access = await getUserDeptAccess(userId, orgId, role);
    if (access?.accessType === 'FULL') return true;
    if (access?.accessType === 'SPECIFIC') return access.departmentIds.includes(departmentId);
    // No grant — fall back to own dept
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (!me?.departmentId || me.departmentId !== departmentId) return false;
  }
  return true;
}

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  departmentId: z.string(),
  managerUserId: z.string().optional(),
  departmentHeadUserId: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  departmentId: z.string().optional(),
  managerUserId: z.string().nullable().optional(),
  departmentHeadUserId: z.string().nullable().optional(),
});

// ── GET /teams ────────────────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  const { orgId, role, userId } = req.user!;

  let whereExtra: object = {};
  if (role === 'TEAM_MEMBER') {
    whereExtra = { OR: [{ members: { some: { userId } } }, { managerUserId: userId }] };
  } else if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER') {
    const access = await getUserDeptAccess(userId, orgId, role);
    if (access?.accessType === 'FULL') {
      // no filter — can see all teams
    } else if (access?.accessType === 'SPECIFIC') {
      whereExtra = { departmentId: { in: access.departmentIds } };
    } else {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
      if (me?.departmentId) whereExtra = { departmentId: me.departmentId };
    }
  }

  const teams = await prisma.team.findMany({
    where: { orgId, isActive: true, ...whereExtra },
    include: teamInclude,
    orderBy: { name: 'asc' },
  });

  res.json(teams.map(formatTeam));
});

// ── GET /teams/managed — teams where current user is the project manager ──────

router.get('/managed', async (req: AuthRequest, res: Response) => {
  const { orgId, userId } = req.user!;
  const teams = await prisma.team.findMany({
    where: { orgId, isActive: true, managerUserId: userId },
    include: teamInclude,
    orderBy: { name: 'asc' },
  });
  res.json(teams.map(formatTeam));
});

// ── GET /teams/:id ────────────────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const teamId = req.params['id'] as string;
  const team = await prisma.team.findFirst({
    where: { id: teamId, orgId, isActive: true },
    include: teamInclude,
  });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }
  res.json(formatTeam(team));
});

// ── GET /teams/:id/overview  (full project view for managers/dept heads) ──────

router.get(
  '/:id/overview',
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;

    const team = await prisma.team.findFirst({
      where: { id: teamId, orgId, isActive: true },
      include: teamInclude,
    });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const elevated = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(role);
    const isProjectManager = team.managerUserId === userId;
    const isMember = team.members.some((m: { userId: string }) => m.userId === userId);
    if (!elevated && !isProjectManager && !isMember) {
      res.status(403).json({ error: 'Access denied' }); return;
    }

    const memberUserIds = team.members.map((m: { userId: string }) => m.userId);

    // Only tasks explicitly created for this team (not personal/individual tasks)
    const allTasks = memberUserIds.length > 0
      ? await prisma.task.findMany({
          where: { orgId, teamId, assigneeUserId: { in: memberUserIds } },
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, createdAt: true,
            completionSubmittedAt: true,
            assigneeUserId: true,
            department: { select: { id: true, name: true } },
            _count: { select: { attachments: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const now = new Date();

    const isOverdue = (t: { dueDate: Date | null; status: string }) =>
      !!t.dueDate && t.dueDate < now && t.status !== 'DONE' && t.status !== 'CANCELLED';

    // Overall stats
    const total = allTasks.length;
    const done = allTasks.filter((t) => t.status === 'DONE').length;
    const inProgress = allTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const blocked = allTasks.filter((t) => t.status === 'BLOCKED').length;
    const inReview = allTasks.filter((t) => t.status === 'IN_REVIEW').length;
    const todo = allTasks.filter((t) => t.status === 'TODO').length;
    const overdue = allTasks.filter(isOverdue).length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    // Per-member stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberStats = team.members.map((m: any) => {
      const tasks = allTasks.filter((t) => t.assigneeUserId === m.userId);
      const mTotal = tasks.length;
      const mDone = tasks.filter((t) => t.status === 'DONE').length;
      return {
        user: m.user,
        joinedAt: m.joinedAt,
        stats: {
          total: mTotal,
          done: mDone,
          inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
          inReview: tasks.filter((t) => t.status === 'IN_REVIEW').length,
          blocked: tasks.filter((t) => t.status === 'BLOCKED').length,
          todo: tasks.filter((t) => t.status === 'TODO').length,
          overdue: tasks.filter(isOverdue).length,
          completionRate: mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0,
        },
        tasks,
      };
    });

    // Generate AI Summary of everyone in the project (1-2 lines per person) using Groq
    const activeMembersData = memberStats.map((ms) => ({
      name: ms.user.name,
      role: ms.user.role,
      completed: ms.tasks.filter((t) => t.status === 'DONE').map((t) => t.title),
      inProgress: ms.tasks.filter((t) => t.status === 'IN_PROGRESS').map((t) => t.title),
      inReview: ms.tasks.filter((t) => t.status === 'IN_REVIEW').map((t) => t.title),
      blocked: ms.tasks.filter((t) => t.status === 'BLOCKED').map((t) => t.title),
      todo: ms.tasks.filter((t) => t.status === 'TODO').map((t) => t.title),
      overdueCount: ms.stats.overdue,
    }));

    let aiOverview = '';
    if (activeMembersData.length > 0) {
      const prompt = `You are a professional project manager. Summarize the status and progress of the following team members in this project.
Write a concise 1-2 sentence overview for each member highlighting their focus, completed work, and potential blockers/overdue items.
Keep it direct, professional, and action-oriented.

Return ONLY a valid JSON object mapping each user's Name to their 1-2 sentence status overview string, for example:
{
  "John Doe": "Currently working on frontend components; has resolved 2 key bugs, but is currently blocked on the backend API deployment."
}

Members data:
${JSON.stringify(activeMembersData, null, 2)}
`;
      try {
        const text = await callGroq(prompt, 'You are an AI assistant generating project status overviews.');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
          aiOverview = Object.entries(parsed)
            .map(([name, desc]) => `**${name}**: ${desc}`)
            .join('\n\n');
        }
      } catch (e) {
        console.error('Error generating project AI overview:', e);
      }
    }

    res.json({
      team: formatTeam(team),
      stats: { total, done, inProgress, inReview, todo, blocked, overdue, completionRate },
      memberStats,
      aiOverview,
    });
  }
);

// ── POST /teams ───────────────────────────────────────────────────────────────

router.post(
  '/',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'),
  auditLog('team', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { orgId, role, userId } = req.user!;
    const { departmentId, managerUserId, departmentHeadUserId } = parsed.data;

    const dept = await prisma.department.findFirst({ where: { id: departmentId, orgId, isActive: true }, select: { id: true } });
    if (!dept) { res.status(400).json({ error: 'Department not found' }); return; }

    if (!(await assertDeptAccess(role, userId, orgId, departmentId))) {
      res.status(403).json({ error: 'You can only create teams in your own department' }); return;
    }

    if (managerUserId) {
      const mgr = await prisma.user.findFirst({ where: { id: managerUserId, orgId, departmentId, status: 'ACTIVE' }, select: { id: true } });
      if (!mgr) { res.status(400).json({ error: 'Manager must be an active user in the selected department' }); return; }
    }

    if (departmentHeadUserId) {
      const dh = await prisma.user.findFirst({ where: { id: departmentHeadUserId, orgId, status: 'ACTIVE' }, select: { id: true } });
      if (!dh) { res.status(400).json({ error: 'Department head user not found' }); return; }
    }

    try {
      const team = await prisma.team.create({ data: { ...parsed.data, orgId }, include: teamInclude });
      res.status(201).json(formatTeam(team));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Team slug already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create team' });
      }
    }
  }
);

// ── PATCH /teams/:id ──────────────────────────────────────────────────────────

router.patch(
  '/:id',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'),
  auditLog('team', 'UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const team = await prisma.team.findFirst({ where: { id: teamId, orgId }, select: { id: true, departmentId: true } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    if (!(await assertDeptAccess(role, userId, orgId, team.departmentId))) {
      res.status(403).json({ error: 'You can only update teams in your own department' }); return;
    }

    const nextDeptId = parsed.data.departmentId ?? team.departmentId;

    if (parsed.data.managerUserId) {
      // Allow any active org user (including team members with any role)
      const mgr = await prisma.user.findFirst({ where: { id: parsed.data.managerUserId, orgId, status: 'ACTIVE' }, select: { id: true } });
      if (!mgr) { res.status(400).json({ error: 'Manager user not found or inactive' }); return; }
    }

    if (parsed.data.departmentHeadUserId) {
      const dh = await prisma.user.findFirst({ where: { id: parsed.data.departmentHeadUserId, orgId, status: 'ACTIVE' }, select: { id: true } });
      if (!dh) { res.status(400).json({ error: 'Department head user not found' }); return; }
    }

    try {
      const updated = await prisma.team.update({
        where: { id: teamId },
        data: {
          ...(parsed.data.name && { name: parsed.data.name }),
          ...(parsed.data.slug && { slug: parsed.data.slug }),
          ...(parsed.data.description !== undefined && { description: parsed.data.description || null }),
          ...(parsed.data.departmentId && { departmentId: parsed.data.departmentId }),
          ...('managerUserId' in parsed.data && { managerUserId: parsed.data.managerUserId ?? null }),
          ...('departmentHeadUserId' in parsed.data && { departmentHeadUserId: parsed.data.departmentHeadUserId ?? null }),
        },
        include: teamInclude,
      });
      res.json(formatTeam(updated));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Team slug already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update team' });
      }
    }
  }
);

// ── DELETE /teams/:id ─────────────────────────────────────────────────────────

router.delete(
  '/:id',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;
    const team = await prisma.team.findFirst({ where: { id: teamId, orgId }, select: { id: true, departmentId: true } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    if (!(await assertDeptAccess(role, userId, orgId, team.departmentId))) {
      res.status(403).json({ error: 'You can only delete teams in your own department' }); return;
    }

    await prisma.team.delete({ where: { id: teamId } });
    res.json({ success: true });
  }
);

// ── POST /teams/:id/members  (add a member) ───────────────────────────────────

router.post(
  '/:id/members',
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;
    const memberId = (req.body as { userId?: string }).userId;
    if (!memberId) { res.status(400).json({ error: 'userId is required' }); return; }

    const team = await prisma.team.findFirst({ where: { id: teamId, orgId }, select: { id: true, departmentId: true, managerUserId: true } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const elevated = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(role);
    const isProjectManager = team.managerUserId === userId;
    if (!elevated && !isProjectManager) {
      res.status(403).json({ error: 'Only project managers or admins can add members' }); return;
    }

    if (elevated && !(await assertDeptAccess(role, userId, orgId, team.departmentId))) {
      res.status(403).json({ error: 'You can only manage teams in your own department' }); return;
    }

    const member = await prisma.user.findFirst({ where: { id: memberId, orgId, status: 'ACTIVE' }, select: { id: true } });
    if (!member) { res.status(400).json({ error: 'User not found or not active' }); return; }

    try {
      await prisma.teamMember.create({ data: { teamId: team.id, userId: memberId } });
      const updated = await prisma.team.findUnique({ where: { id: team.id }, include: teamInclude });
      res.status(201).json(formatTeam(updated));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'User is already a member of this team' });
      } else {
        res.status(500).json({ error: 'Failed to add member' });
      }
    }
  }
);

// ── DELETE /teams/:id/members/:memberId  (remove a member) ───────────────────

router.delete(
  '/:id/members/:memberId',
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;
    const memberId = req.params['memberId'] as string;

    const team = await prisma.team.findFirst({ where: { id: teamId, orgId }, select: { id: true, departmentId: true, managerUserId: true } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const elevated = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(role);
    const isProjectManager = team.managerUserId === userId;
    if (!elevated && !isProjectManager) {
      res.status(403).json({ error: 'Only project managers or admins can remove members' }); return;
    }

    if (elevated && !(await assertDeptAccess(role, userId, orgId, team.departmentId))) {
      res.status(403).json({ error: 'You can only manage teams in your own department' }); return;
    }

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: memberId } },
    });
    if (!membership) { res.status(404).json({ error: 'Member not found in team' }); return; }

    await prisma.teamMember.delete({ where: { teamId_userId: { teamId: team.id, userId: memberId } } });
    const updated = await prisma.team.findUnique({ where: { id: team.id }, include: teamInclude });
    res.json(formatTeam(updated));
  }
);

// ── GET /teams/:id/documents ─────────────────────────────────────────────────

router.get('/:id/documents', async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const teamId = req.params['id'] as string;
  const team = await prisma.team.findFirst({ where: { id: teamId, orgId, isActive: true }, select: { id: true } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const docs = await prisma.teamDocument.findMany({
    where: { teamId, orgId },
    include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

// ── POST /teams/:id/documents  (anyone can add) ───────────────────────────────

router.post('/:id/documents', async (req: AuthRequest, res: Response) => {
  const { orgId, userId } = req.user!;
  const teamId = req.params['id'] as string;

  const bodySchema = z.object({
    name:     z.string().min(1),
    url:      z.string().url(),
    fileType: z.string().optional(),
    size:     z.number().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const team = await prisma.team.findFirst({ where: { id: teamId, orgId, isActive: true }, select: { id: true } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const doc = await prisma.teamDocument.create({
    data: { teamId, orgId, uploadedById: userId, ...parsed.data },
    include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
  res.status(201).json(doc);
});

// ── DELETE /teams/:id/documents/:docId  (OWNER and DEPARTMENT_HEAD only) ─────

router.delete(
  '/:id/documents/:docId',
  requireRole('OWNER', 'DEPARTMENT_HEAD'),
  async (req: AuthRequest, res: Response) => {
    const { orgId } = req.user!;
    const { id: teamId, docId } = req.params as { id: string; docId: string };

    const doc = await prisma.teamDocument.findFirst({ where: { id: docId, teamId, orgId } });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    await prisma.teamDocument.delete({ where: { id: docId } });
    res.json({ success: true });
  }
);

// ── POST /teams/:id/tasks  (assign task to whole team or one member) ──────────

router.post(
  '/:id/tasks',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, role, userId } = req.user!;
    const teamId = req.params['id'] as string;

    const taskSchema = z.object({
      title: z.string().min(2),
      description: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      dueDate: z.string().optional(),
      assignToUserId: z.string().optional(),
      phaseId: z.string().optional(),
    });

    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const team = await prisma.team.findFirst({
      where: { id: teamId, orgId },
      select: { id: true, departmentId: true, managerUserId: true, department: { select: { name: true } }, members: { select: { userId: true } } },
    });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    // Validate phase-wise tasks for Engineering department projects
    if (team.department && team.department.name.toLowerCase().includes('engineering')) {
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
        res.status(400).json({ error: `Task due date cannot be beyond the Phase deadline (${phase.dueDate.toISOString().split('T')[0]}).` });
        return;
      }
    }

    const isProjectManager = team.managerUserId === userId;

    if (role === 'TEAM_MEMBER') {
      // Must be a member or the project manager of this team
      const isMember = team.members.some((m: { userId: string }) => m.userId === userId);
      if (!isMember && !isProjectManager) {
        res.status(403).json({ error: 'You are not a member of this team' }); return;
      }
    } else if (!(await assertDeptAccess(role, userId, orgId, team.departmentId))) {
      res.status(403).json({ error: 'You can only assign tasks for teams in your own department' }); return;
    }

    const { assignToUserId, dueDate, phaseId, ...taskBase } = parsed.data;

    // Project managers can assign to any member; regular team members only to themselves
    const canAssignOthers = role !== 'TEAM_MEMBER' || isProjectManager;
    const targetUserIds: string[] = canAssignOthers
      ? assignToUserId
        ? [assignToUserId]
        : team.members.map((m: { userId: string }) => m.userId)
      : [userId];

    if (targetUserIds.length === 0) {
      res.status(400).json({ error: 'No members to assign task to — add members first' }); return;
    }

    const dueDateVal = dueDate ? new Date(dueDate) : undefined;

    const created = await prisma.$transaction(
      targetUserIds.map((assigneeId) =>
        prisma.task.create({
          data: {
            ...taskBase,
            orgId,
            teamId,
            departmentId: team.departmentId,
            assigneeUserId: assigneeId,
            assignedByUserId: userId,
            phaseId: phaseId || null,
            ...(dueDateVal && { dueDate: dueDateVal }),
          },
          select: { id: true, title: true, assignee: { select: { id: true, name: true } } },
        })
      )
    );

    res.status(201).json({ created });
  }
);

export default router;
