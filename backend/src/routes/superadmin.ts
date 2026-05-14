import { Router, Response } from 'express';
import prisma from '../lib/prisma';
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

// POST /superadmin/orgs/:id/impersonate — get a temp token for org owner
router.post('/orgs/:id/impersonate', async (req: AuthRequest, res: Response) => {
  const owner = await prisma.user.findFirst({
    where: { orgId: req.params.id as string, role: 'OWNER' },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!owner) { res.status(404).json({ error: 'Owner not found' }); return; }
  // In production: sign short-lived JWT with impersonation flag
  res.json({ message: 'Impersonation ready (sign JWT in production)', user: owner });
});

export default router;
