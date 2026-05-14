import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

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
    prisma.task.count({ where: { orgId, status: { not: 'DONE' }, dueDate: { lt: new Date() } } }),
    prisma.task.count({ where: { orgId, status: 'BLOCKED' } }),
    prisma.standup.findMany({
      where: {
        orgId,
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      include: { department: { select: { name: true } } },
    }),
    prisma.kRA.findMany({
      where: { orgId, status: { not: 'MISSED' } },
      include: { department: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    departments,
    tasks: { total: totalTasks, done: doneTasks, overdue: overdueTasks, blocked: blockedTasks },
    todayStandups,
    kras,
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

export default router;
