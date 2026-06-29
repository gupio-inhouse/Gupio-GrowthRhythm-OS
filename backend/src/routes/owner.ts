import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { generateWeeklyDigest } from '../services/ai.service';

const router = Router();
router.use(authenticate, requireRole('OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'));

// GET /owner/cockpit — company-wide overview
router.get('/cockpit', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const { departmentId, assigneeId, status: statusFilter, from: fromStr, to: toStr } =
    req.query as Record<string, string | undefined>;

  // Base task filter (department + member + date)
  const taskBase: Record<string, unknown> = { orgId };
  if (departmentId) taskBase.departmentId = departmentId;
  if (assigneeId) taskBase.assigneeUserId = assigneeId;
  if (fromStr || toStr) {
    const dueDateFilter: Record<string, unknown> = {};
    if (fromStr) dueDateFilter.gte = new Date(fromStr);
    if (toStr) dueDateFilter.lte = new Date(toStr);
    taskBase.dueDate = dueDateFilter;
  }

  // Total tasks — respects status filter for the "total" denominator
  let totalWhere: Record<string, unknown> = { ...taskBase };
  if (statusFilter === 'overdue') {
    totalWhere = { ...taskBase, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() } };
  } else if (statusFilter === 'due_today') {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(); end.setUTCHours(23, 59, 59, 999);
    totalWhere  = { ...taskBase, dueDate: { gte: start, lte: end } };
  } else if (statusFilter) {
    totalWhere = { ...taskBase, status: statusFilter };
  }

  const [
    totalUsers,
    activeUsers,
    departments,
    totalTasks,
    doneTasks,
    overdueTasks,
    blockedTasks,
    todayStandups,
  ] = await Promise.all([
    prisma.user.count({ where: { orgId, status: 'ACTIVE' } }),
    prisma.user.findMany({
      where: { orgId, status: 'ACTIVE', lastLoginAt: { gte: new Date(Date.now() - 86400000) } },
      select: { id: true, name: true, role: true, lastLoginAt: true, department: { select: { name: true } } },
      orderBy: { lastLoginAt: 'desc' },
    }),
    prisma.department.findMany({
      where: { orgId, isActive: true, ...(departmentId ? { id: departmentId } : {}) },
      include: { _count: { select: { users: true, tasks: true } } },
    }),
    prisma.task.count({ where: totalWhere }),
    prisma.task.count({ where: { ...taskBase, status: 'DONE' } }),
    prisma.task.count({ where: { ...taskBase, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() } } }),
    prisma.task.count({ where: { ...taskBase, status: 'BLOCKED' } }),
    prisma.standup.findMany({
      where: {
        orgId,
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      include: {
        department: { select: { name: true } },
        _count: { select: { cards: true } },
        cards: {
          where: { status: 'SUBMITTED' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  // M8.4: standup attendance breakdown per department
  const standupAttendance = todayStandups.map((s) => ({
    departmentName: s.department.name,
    status: s.status,
    totalMembers: s._count.cards,
    submitted: s.cards.length,
    attendanceRate: s._count.cards > 0
      ? Math.round((s.cards.length / s._count.cards) * 100)
      : 0,
    overrunMinutes: (s as unknown as { overrunMinutes?: number }).overrunMinutes ?? 0,
    attendees: s.cards.map((c) => ({ id: c.user.id, name: c.user.name })),
  }));

  res.json({
    totalUsers,
    activeUsers: activeUsers.length,
    activeUsersList: activeUsers,
    departments,
    tasks: { total: totalTasks, done: doneTasks, overdue: overdueTasks, blocked: blockedTasks },
    todayStandups,
    standupAttendanceToday: Math.round((todayStandups.filter(s => s.status === 'COMPLETED').length / Math.max(todayStandups.length, 1)) * 100),
    standupAttendance,
  });
});

// GET /owner/cockpit/blockers
router.get('/cockpit/blockers', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const { departmentId, assigneeId } = req.query as Record<string, string | undefined>;

  const base: Record<string, unknown> = { orgId };
  if (departmentId) base.departmentId = departmentId;
  if (assigneeId) base.assigneeUserId = assigneeId;

  const [blockers, repeatedBlockers] = await Promise.all([
    prisma.task.groupBy({
      by: ['blockerType'],
      where: { ...base, status: 'BLOCKED', blockerType: { not: null } },
      _count: true,
      orderBy: { _count: { blockerType: 'desc' } },
    }),
    prisma.task.findMany({
      where: { ...base, blockerCount: { gte: 3 } },
      include: {
        assignee: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { blockerCount: 'desc' },
      take: 10,
    }),
  ]);

  res.json({ blockersByType: blockers, repeatedBlockers });
});

// GET /owner/cockpit/weekly-summary
router.get('/cockpit/weekly-summary', async (req: AuthRequest, res: Response) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const orgId = req.user!.orgId;
  const { departmentId, assigneeId } = req.query as Record<string, string | undefined>;

  const base: Record<string, unknown> = { orgId };
  if (departmentId) base.departmentId = departmentId;
  if (assigneeId) base.assigneeUserId = assigneeId;

  const [completedThisWeek, newBlockers, standupCount] = await Promise.all([
    prisma.task.count({ where: { ...base, status: 'DONE', completedAt: { gte: weekAgo } } }),
    prisma.task.count({ where: { ...base, status: 'BLOCKED', createdAt: { gte: weekAgo } } }),
    prisma.standup.count({ where: { orgId, status: 'COMPLETED', scheduledAt: { gte: weekAgo } } }),
  ]);

  res.json({ completedThisWeek, newBlockers, standupCount });
});

// GET /owner/cockpit/weekly-digest
router.get('/cockpit/weekly-digest', async (req: AuthRequest, res: Response) => {
  try {
    const digest = await generateWeeklyDigest(req.user!.orgId);
    res.json({ digest });
  } catch {
    res.status(503).json({ error: 'AI not configured' });
  }
});

// GET /owner/data-export — full org data export (GDPR/DPDPA)
router.get('/data-export', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;

  const [users, tasks, departments, standups, auditLogs] = await Promise.all([
    prisma.user.findMany({
      where: { orgId },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
    }),
    prisma.task.findMany({
      where: { orgId },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true, createdAt: true },
    }),
    prisma.department.findMany({
      where: { orgId },
      select: { id: true, name: true, slug: true, createdAt: true },
    }),
    prisma.standup.findMany({
      where: { orgId },
      select: { id: true, scheduledAt: true, status: true, overrunMinutes: true },
    }),
    prisma.auditLog.findMany({
      where: { user: { orgId } },
      select: { id: true, entityType: true, action: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  res.setHeader('Content-Disposition', `attachment; filename="growthrhythm-export-${new Date().toISOString().split('T')[0]}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json({ exportedAt: new Date(), orgId, users, tasks, departments, standups, auditLogs });
});

export default router;
