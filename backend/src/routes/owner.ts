import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { generateWeeklyDigest, generateGoalSuggestions } from '../services/ai.service';

const router = Router();
router.use(authenticate, requireRole('OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'));

// GET /owner/cockpit — company-wide overview
router.get('/cockpit', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;

  const [
    totalUsers,
    activeUsers,
    departments,
    totalTasks,
    doneTasks,
    overdueTasks,
    blockedTasks,
    todayStandups,
    kras,
  ] = await Promise.all([
    prisma.user.count({ where: { orgId, status: 'ACTIVE' } }),
    prisma.user.count({ where: { orgId, status: 'ACTIVE', lastLoginAt: { gte: new Date(Date.now() - 86400000) } } }),
    prisma.department.findMany({
      where: { orgId, isActive: true },
      include: {
        _count: { select: { users: true, kras: true, tasks: true } },
      },
    }),
    prisma.task.count({ where: { orgId } }),
    prisma.task.count({ where: { orgId, status: 'DONE' } }),
    prisma.task.count({ where: { orgId, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() } } }),
    prisma.task.count({ where: { orgId, status: 'BLOCKED' } }),
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
    prisma.kRA.findMany({
      where: { orgId, status: { not: 'MISSED' } },
      include: { department: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
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
    activeUsers,
    departments,
    tasks: { total: totalTasks, done: doneTasks, overdue: overdueTasks, blocked: blockedTasks },
    todayStandups,
    kras,
    standupAttendanceToday: Math.round((todayStandups.filter(s => s.status === 'COMPLETED').length / Math.max(todayStandups.length, 1)) * 100),
    standupAttendance,
  });
});

// GET /owner/cockpit/blockers
router.get('/cockpit/blockers', async (req: AuthRequest, res: Response) => {
  const blockers = await prisma.task.groupBy({
    by: ['blockerType'],
    where: { orgId: req.user!.orgId, status: 'BLOCKED', blockerType: { not: null } },
    _count: true,
    orderBy: { _count: { blockerType: 'desc' } },
  });

  const repeatedBlockers = await prisma.task.findMany({
    where: { orgId: req.user!.orgId, blockerCount: { gte: 3 } },
    include: {
      assignee: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { blockerCount: 'desc' },
    take: 10,
  });

  res.json({ blockersByType: blockers, repeatedBlockers });
});

// GET /owner/cockpit/weekly-summary
router.get('/cockpit/weekly-summary', async (req: AuthRequest, res: Response) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const orgId = req.user!.orgId;

  const [completedThisWeek, newBlockers, standupCount, learnCompletions] = await Promise.all([
    prisma.task.count({ where: { orgId, status: 'DONE', completedAt: { gte: weekAgo } } }),
    prisma.task.count({ where: { orgId, status: 'BLOCKED', createdAt: { gte: weekAgo } } }),
    prisma.standup.count({ where: { orgId, status: 'COMPLETED', scheduledAt: { gte: weekAgo } } }),
    prisma.learningAssignment.count({ where: { user: { orgId }, status: 'COMPLETED', completedAt: { gte: weekAgo } } }),
  ]);

  res.json({ completedThisWeek, newBlockers, standupCount, learnCompletions });
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

// POST /owner/ai/goal-suggestions
router.post('/ai/goal-suggestions', async (req: AuthRequest, res: Response) => {
  const { description } = req.body;
  const suggestions = await generateGoalSuggestions(description, req.user!.orgId);
  res.json({ suggestions });
});

// GET /owner/data-export — full org data export (GDPR/DPDPA)
router.get('/data-export', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;

  const [users, tasks, departments, kras, goals, standups, auditLogs] = await Promise.all([
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
    prisma.kRA.findMany({
      where: { orgId },
      select: { id: true, name: true, target: true, current: true, status: true },
    }),
    prisma.goal.findMany({
      where: { orgId },
      select: { id: true, title: true, type: true, status: true, dueDate: true },
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
  res.json({ exportedAt: new Date(), orgId, users, tasks, departments, kras, goals, standups, auditLogs });
});

export default router;
