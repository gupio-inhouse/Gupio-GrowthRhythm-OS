import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

// GET /superadmin/orgs — all organizations
router.get('/orgs', async (_req: AuthRequest, res: Response) => {
  const orgs = await prisma.organization.findMany({
    include: {
      _count: { select: { users: true, departments: true, tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orgs);
});

// GET /superadmin/orgs/:id
router.get('/orgs/:id', async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id as string },
    include: {
      users: {
        where: { role: { in: ['OWNER', 'COMPANY_ADMIN'] } },
        select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true },
      },
      _count: { select: { users: true, departments: true, tasks: true, kras: true } },
    },
  });
  if (!org) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(org);
});

// PATCH /superadmin/orgs/:id — update plan, status, credits
router.patch('/orgs/:id', async (req: AuthRequest, res: Response) => {
  const { plan, isActive, aiCreditsTotal } = req.body;
  const data: Record<string, unknown> = {};
  if (plan) data.plan = plan;
  if (isActive !== undefined) data.isActive = isActive;
  if (aiCreditsTotal !== undefined) data.aiCreditsTotal = aiCreditsTotal;

  const org = await prisma.organization.update({
    where: { id: req.params.id as string },
    data,
  });
  res.json(org);
});

// GET /superadmin/stats — platform-wide metrics
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  const [totalOrgs, totalUsers, totalTasks, activeOrgs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.task.count(),
    prisma.organization.count({ where: { isActive: true } }),
  ]);
  res.json({ totalOrgs, totalUsers, totalTasks, activeOrgs });
});

// POST /superadmin/orgs/:id/impersonate — M12.5: issue short-lived impersonation JWT
router.post('/orgs/:id/impersonate', async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, name: true },
  });
  if (!org) { res.status(404).json({ error: 'Org not found' }); return; }

  const owner = await prisma.user.findFirst({
    where: { orgId: req.params.id as string, role: 'OWNER' },
    select: { id: true, name: true, email: true, role: true, orgId: true },
  });
  if (!owner) { res.status(404).json({ error: 'Owner not found in this org' }); return; }

  const token = jwt.sign(
    { userId: owner.id, orgId: owner.orgId, role: owner.role, impersonatedBy: req.user!.userId },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );

  res.json({ token, user: owner, org, expiresIn: 3600 });
});

// GET /superadmin/health — M12.6: system health metrics
router.get('/health', async (_req: AuthRequest, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
  ]);

  const [orgCount, userCount, taskCount, notifCount] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.task.count(),
    prisma.notification.count({ where: { status: 'SCHEDULED' } }),
  ]);

  const memUsage = process.memoryUsage();

  res.json({
    status: dbOk && redisOk ? 'healthy' : 'degraded',
    services: {
      database: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
    stats: { orgCount, userCount, taskCount, pendingNotifications: notifCount },
    process: {
      uptime: Math.round(process.uptime()),
      memoryMB: Math.round(memUsage.rss / 1024 / 1024),
      heapMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    },
    ts: new Date(),
  });
});

export default router;
