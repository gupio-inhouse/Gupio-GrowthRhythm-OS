import { Router, Response } from 'express';
import { z } from 'zod';
import { BugStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getViewerScope, canAccessUser } from './users';
import { assertDeptAccess } from './teams';

const router = Router();
router.use(authenticate);

const rangeSchema = z.object({
  from: z.string().datetime('from must be a valid ISO timestamp'),
  to: z.string().datetime('to must be a valid ISO timestamp'),
});

function parseRange(query: unknown): { from: Date; to: Date } | { error: string } {
  const parsed = rangeSchema.safeParse(query);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  if (from > to) return { error: 'from must be before to' };
  return { from, to };
}

const taskSelect = {
  id: true, title: true, status: true, priority: true,
  startDate: true, dueDate: true, completedAt: true,
  blockerType: true,
  team: { select: { id: true, name: true } },
} as const;

// Bugs relevant to a period: resolved within it, or currently still open/in-review
// regardless of when they were created — same definition used in report.service.ts's
// scheduled digest, kept consistent across every report surface in the app.
const RESOLVED_BUG_STATUSES: BugStatus[] = ['FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];

const bugSelect = {
  id: true, title: true, type: true, status: true, severity: true,
  createdAt: true, resolvedAt: true, closedAt: true,
  team: { select: { id: true, name: true } },
} as const;

function bugPeriodWhere(from: Date, to: Date) {
  return {
    OR: [
      { status: { in: RESOLVED_BUG_STATUSES }, OR: [{ closedAt: { gte: from, lte: to } }, { resolvedAt: { gte: from, lte: to } }] },
      { status: { notIn: RESOLVED_BUG_STATUSES } },
    ],
  };
}

function summarizeBugs<T extends { status: BugStatus }>(bugs: T[]) {
  const totalBugs = bugs.length;
  const resolvedBugs = bugs.filter((b) => RESOLVED_BUG_STATUSES.includes(b.status)).length;
  const inReviewBugs = bugs.filter((b) => b.status === 'IN_REVIEW').length;
  const openBugs = totalBugs - resolvedBugs - inReviewBugs;
  const bugResolutionRate = totalBugs > 0 ? Math.round((resolvedBugs / totalBugs) * 100) : 0;
  return { totalBugs, resolvedBugs, inReviewBugs, openBugs, bugResolutionRate };
}

function summarizeTasks<T extends { status: string; dueDate: Date | null; completedAt: Date | null }>(tasks: T[], now: Date) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
  const inReviewTasks = tasks.filter((t) => t.status === 'IN_REVIEW').length;
  const todoTasks = tasks.filter((t) => t.status === 'TODO').length;
  const cancelledTasks = tasks.filter((t) => t.status === 'CANCELLED').length;
  const overdueTasks = tasks.filter((t) =>
    t.status !== 'DONE' && t.status !== 'CANCELLED' && !!t.dueDate && t.dueDate < now
  ).length;
  const lateCompletedTasks = tasks.filter((t) =>
    t.status === 'DONE' && !!t.dueDate && !!t.completedAt && t.completedAt > t.dueDate
  ).length;
  // On-time = completed with no due date to miss, or completed at/before it — the
  // same "on time" definition already used by the scheduled org digest.
  const onTimeCompletedTasks = completedTasks - lateCompletedTasks;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const onTimeRate = completedTasks > 0 ? Math.round((onTimeCompletedTasks / completedTasks) * 100) : 0;
  return {
    totalTasks, completedTasks, inProgressTasks, blockedTasks, inReviewTasks,
    todoTasks, cancelledTasks, overdueTasks, lateCompletedTasks, onTimeCompletedTasks,
    completionRate, onTimeRate,
  };
}

// A task's delay, in whichever unit reads more naturally: hours if under a day,
// otherwise days (+ leftover hours). "Late" = finished after its due date;
// "overdue" = still open past its due date, measured against now.
function formatDelayMs(ms: number): string {
  const totalHours = Math.round(ms / 3_600_000);
  if (totalHours < 24) return `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours - days * 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

type DelayInfo = { kind: 'overdue' | 'late'; label: string } | null;

function taskDelay(task: { status: string; dueDate: Date | null; completedAt: Date | null }, now: Date): DelayInfo {
  if (!task.dueDate) return null;
  if (task.status === 'DONE') {
    if (!task.completedAt || task.completedAt <= task.dueDate) return null;
    return { kind: 'late', label: `${formatDelayMs(task.completedAt.getTime() - task.dueDate.getTime())} late` };
  }
  if (task.status !== 'CANCELLED' && task.dueDate < now) {
    return { kind: 'overdue', label: `${formatDelayMs(now.getTime() - task.dueDate.getTime())} overdue` };
  }
  return null;
}

function withDelay<T extends { status: string; dueDate: Date | null; completedAt: Date | null }>(tasks: T[], now: Date) {
  return tasks.map((t) => ({ ...t, delay: taskDelay(t, now) }));
}

// GET /reports/individual/:userId?from=...&to=...
// Custom-range report for one person — tasks due or completed within the window.
router.get('/individual/:userId', async (req: AuthRequest, res: Response) => {
  const range = parseRange(req.query);
  if ('error' in range) {
    res.status(400).json({ error: range.error });
    return;
  }
  const { from, to } = range;

  const viewer = await getViewerScope(req.user!.userId);
  if (!viewer) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.userId as string, orgId: req.user!.orgId },
    select: {
      id: true, name: true, email: true, role: true, departmentId: true,
      department: { select: { id: true, name: true } },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (!canAccessUser(viewer, user)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const tasks = await prisma.task.findMany({
    where: {
      orgId: req.user!.orgId, assigneeUserId: user.id,
      OR: [
        { dueDate: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
      ],
    },
    select: taskSelect,
    orderBy: [{ dueDate: 'asc' }],
  });

  const now = new Date();

  const bugs = await prisma.bug.findMany({
    where: { orgId: req.user!.orgId, assigneeUserId: user.id, ...bugPeriodWhere(from, to) },
    select: bugSelect,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
    from, to,
    summary: summarizeTasks(tasks, now),
    tasks: withDelay(tasks, now),
    bugSummary: summarizeBugs(bugs),
    bugs,
  });
});

// GET /reports/department/:departmentId?from=...&to=...
// Custom-range rollup for a whole department — manager-level roles only, since
// assertDeptAccess() falls through to `true` for roles it doesn't recognize
// (TEAM_MEMBER included) — existing callers gate TEAM_MEMBER separately before
// calling it, so this route must do the same rather than call it directly.
const DEPT_REPORT_ROLES = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'];

router.get('/department/:departmentId', async (req: AuthRequest, res: Response) => {
  if (!DEPT_REPORT_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const range = parseRange(req.query);
  if ('error' in range) {
    res.status(400).json({ error: range.error });
    return;
  }
  const { from, to } = range;

  const { role, userId, orgId } = req.user!;
  const departmentId = req.params.departmentId as string;

  if (!(await assertDeptAccess(role, userId, orgId, departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const department = await prisma.department.findFirst({
    where: { id: departmentId, orgId },
    select: { id: true, name: true },
  });
  if (!department) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  const members = await prisma.user.findMany({
    where: { orgId, departmentId, status: 'ACTIVE', role: { notIn: ['OWNER', 'COMPANY_ADMIN'] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true },
  });

  const tasks = await prisma.task.findMany({
    where: {
      orgId, departmentId,
      OR: [
        { dueDate: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
      ],
    },
    select: { ...taskSelect, assigneeUserId: true },
    orderBy: [{ dueDate: 'asc' }],
  });

  const tasksByUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.assigneeUserId) continue;
    if (!tasksByUser.has(t.assigneeUserId)) tasksByUser.set(t.assigneeUserId, []);
    tasksByUser.get(t.assigneeUserId)!.push(t);
  }

  const bugs = await prisma.bug.findMany({
    where: { orgId, departmentId, ...bugPeriodWhere(from, to) },
    select: { ...bugSelect, assigneeUserId: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const bugsByUser = new Map<string, typeof bugs>();
  for (const b of bugs) {
    if (!b.assigneeUserId) continue;
    if (!bugsByUser.has(b.assigneeUserId)) bugsByUser.set(b.assigneeUserId, []);
    bugsByUser.get(b.assigneeUserId)!.push(b);
  }

  const now = new Date();

  const memberReports = members.map((m) => {
    const memberTasks = tasksByUser.get(m.id) ?? [];
    const memberBugs = bugsByUser.get(m.id) ?? [];
    return {
      userId: m.id, name: m.name, role: m.role,
      ...summarizeTasks(memberTasks, now),
      tasks: withDelay(memberTasks, now),
      bugSummary: summarizeBugs(memberBugs),
    };
  });

  res.json({
    department,
    from, to,
    summary: summarizeTasks(tasks, now),
    members: memberReports,
    bugSummary: summarizeBugs(bugs),
  });
});

export default router;
