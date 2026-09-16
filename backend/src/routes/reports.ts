import { Router, Response } from 'express';
import { z } from 'zod';
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
  team: { select: { id: true, name: true } },
} as const;

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
      id: true, name: true, departmentId: true,
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

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  res.json({
    user: { id: user.id, name: user.name, department: user.department },
    from, to,
    summary: { totalTasks, completedTasks, completionRate },
    tasks,
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

  const memberReports = members.map((m) => {
    const memberTasks = tasksByUser.get(m.id) ?? [];
    const completedTasks = memberTasks.filter((t) => t.status === 'DONE').length;
    return {
      userId: m.id, name: m.name, role: m.role,
      totalTasks: memberTasks.length, completedTasks,
      completionRate: memberTasks.length > 0 ? Math.round((completedTasks / memberTasks.length) * 100) : 0,
      tasks: memberTasks,
    };
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  res.json({
    department,
    from, to,
    summary: { totalTasks, completedTasks, completionRate },
    members: memberReports,
  });
});

export default router;
