import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  headUserId: z.string().optional(),
  parentDeptId: z.string().optional(),
  standupTime: z.string().default('09:00'),
});

// GET /departments
router.get('/', async (req: AuthRequest, res: Response) => {
  const departments = await prisma.department.findMany({
    where: { orgId: req.user!.orgId, isActive: true },
    include: {
      head: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { users: true, kras: true, tasks: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(departments);
});

// GET /departments/:slug
router.get('/:slug', async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({
    where: { orgId_slug: { orgId: req.user!.orgId, slug: req.params.slug as string } },
    include: {
      head: { select: { id: true, name: true, email: true, avatarUrl: true } },
      users: { select: { id: true, name: true, email: true, role: true, avatarUrl: true, status: true } },
      kras: { where: { status: { not: 'MISSED' } }, orderBy: { createdAt: 'desc' } },
      _count: { select: { tasks: true, standups: true } },
    },
  });

  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  res.json(dept);
});

// POST /departments
router.post('/', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const dept = await prisma.department.create({
      data: { ...parsed.data, orgId: req.user!.orgId },
    });
    res.status(201).json(dept);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Department slug already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create department' });
    }
  }
});

// PATCH /departments/:id
router.patch('/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  res.json(dept);
});

// GET /departments/:slug/dashboard
router.get('/:slug/dashboard', async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({
    where: { orgId_slug: { orgId: req.user!.orgId, slug: req.params.slug as string } },
    select: { id: true },
  });

  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  const [overdueCount, blockedCount, dueTodayCount, kras, recentStandup, topBlockers] = await Promise.all([
    prisma.task.count({
      where: {
        departmentId: dept.id,
        status: { not: 'DONE' },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.task.count({ where: { departmentId: dept.id, status: 'BLOCKED' } }),
    prisma.task.count({
      where: {
        departmentId: dept.id,
        dueDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        status: { not: 'DONE' },
      },
    }),
    prisma.kRA.findMany({
      where: { departmentId: dept.id, status: { not: 'MISSED' } },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.standup.findFirst({
      where: { departmentId: dept.id },
      orderBy: { scheduledAt: 'desc' },
      include: { _count: { select: { cards: true } } },
    }),
    prisma.task.groupBy({
      by: ['blockerType'],
      where: { departmentId: dept.id, status: 'BLOCKED', blockerType: { not: null } },
      _count: true,
      orderBy: { _count: { blockerType: 'desc' } },
      take: 5,
    }),
  ]);

  res.json({ overdueCount, blockedCount, dueTodayCount, kras, recentStandup, topBlockers });
});

export default router;
