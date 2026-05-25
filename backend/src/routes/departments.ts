import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { getCache, setCache, invalidateCache, cacheKey } from '../lib/cache';

const router = Router();

router.use(authenticate);

async function getActorDepartmentId(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  return actor?.departmentId ?? null;
}

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  headUserId: z.string().optional(),
  parentDeptId: z.string().optional(),
  standupTime: z.string().default('09:00'),
  standupDuration: z.number().default(15),
});

// GET /departments — M6.3: dept heads only see their own dept; admins/owners see all
router.get('/', async (req: AuthRequest, res: Response) => {
  const { role, userId, orgId } = req.user!;

  // Role-scoped filter for dept heads
  let deptIdFilter: string | undefined;
  if (role === 'DEPARTMENT_HEAD') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, headOfDepartments: { select: { id: true } } },
    });
    const headOf = user?.headOfDepartments.map((d) => d.id) ?? [];
    if (user?.departmentId) headOf.push(user.departmentId);
    // Use first dept for simple scoping (complex multi-dept heads need full filter)
    if (headOf.length === 1) deptIdFilter = headOf[0];
  }

  const ck = deptIdFilter
    ? cacheKey('depts', orgId, deptIdFilter)
    : cacheKey('depts', orgId);
  const cached = await getCache(ck);
  if (cached) { res.json(cached); return; }

  const departments = await prisma.department.findMany({
    where: {
      orgId,
      isActive: true,
      ...(deptIdFilter ? { id: deptIdFilter } : {}),
    },
    include: {
      head: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { users: true, kras: true, tasks: true } },
    },
    orderBy: { name: 'asc' },
  });

  await setCache(ck, departments, 60);
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

  if (['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(req.user!.role)) {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId || actorDepartmentId !== dept.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  res.json(dept);
});

// POST /departments
router.post('/', requireRole('OWNER', 'COMPANY_ADMIN'), auditLog('department', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const dept = await prisma.department.create({
      data: { ...parsed.data, orgId: req.user!.orgId },
    });
    await invalidateCache(`depts:${req.user!.orgId}`);
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
router.patch('/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), auditLog('department', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId || actorDepartmentId !== req.params.id) {
      res.status(403).json({ error: 'You can only update your own department' });
      return;
    }
  }

  const dept = await prisma.department.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: req.body,
  });
  await invalidateCache(`depts:${req.user!.orgId}`);
  res.json(dept);
});

// DELETE /departments/:id
router.delete('/:id', requireRole('OWNER', 'COMPANY_ADMIN'), auditLog('department', 'DELETE'), async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, _count: { select: { users: true, kras: true, tasks: true } } },
  });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }

  if (dept._count.users > 0) {
    res.status(400).json({ error: `Cannot delete: ${dept._count.users} team member(s) still assigned to this department.` });
    return;
  }

  await prisma.department.delete({ where: { id: req.params.id as string } });
  await invalidateCache(`depts:${req.user!.orgId}`);
  res.json({ success: true });
});

// GET /departments/:slug/dashboard  (cached 30s)
router.get('/:slug/dashboard', async (req: AuthRequest, res: Response) => {
  const slug = req.params.slug as string;
  const ck = cacheKey('dept-dash', req.user!.orgId, slug);
  const cached = await getCache(ck);
  if (cached) { res.json(cached); return; }

  const dept = await prisma.department.findUnique({
    where: { orgId_slug: { orgId: req.user!.orgId, slug } },
    select: { id: true },
  });

  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  if (['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(req.user!.role)) {
    const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
    if (!actorDepartmentId || actorDepartmentId !== dept.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const LEARNING_WEIGHTS: Record<string, number> = {
    VIDEO: 1, PDF: 1, SOP: 1.5, QUIZ: 2, ASSIGNMENT: 2, ROLE_PLAY: 1.5, EXTERNAL_LINK: 0.5, COACHING_NOTE: 0.5,
  };

  const [overdueCount, blockedCount, dueTodayCount, kras, recentStandup, topBlockers, deptUsers, learningAssignments] = await Promise.all([
    prisma.task.count({ where: { departmentId: dept.id, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: now } } }),
    prisma.task.count({ where: { departmentId: dept.id, status: 'BLOCKED' } }),
    prisma.task.count({ where: { departmentId: dept.id, dueDate: { gte: todayStart, lt: todayEnd }, status: { notIn: ['DONE', 'CANCELLED'] } } }),
    prisma.kRA.findMany({ where: { departmentId: dept.id, status: { not: 'MISSED' } }, take: 8, orderBy: { updatedAt: 'desc' } }),
    prisma.standup.findFirst({ where: { departmentId: dept.id }, orderBy: { scheduledAt: 'desc' }, include: { _count: { select: { cards: true } } } }),
    prisma.task.groupBy({ by: ['blockerType'], where: { departmentId: dept.id, status: 'BLOCKED', blockerType: { not: null } }, _count: true, orderBy: { _count: { blockerType: 'desc' } }, take: 5 }),
    prisma.user.findMany({ where: { departmentId: dept.id, status: 'ACTIVE' }, select: { id: true } }),
    prisma.learningAssignment.findMany({
      where: { user: { departmentId: dept.id } },
      include: { learningItem: { select: { type: true } } },
    }),
  ]);

  // M7.6: weighted learning completion score
  let totalWeight = 0;
  let earnedWeight = 0;
  for (const la of learningAssignments) {
    const w = LEARNING_WEIGHTS[la.learningItem.type] ?? 1;
    totalWeight += w;
    if (la.status === 'COMPLETED') {
      const scoreMultiplier = la.score != null ? la.score / 100 : 1;
      earnedWeight += w * scoreMultiplier;
    }
  }
  const learningCompletionScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : null;
  const learningStats = {
    total: learningAssignments.length,
    completed: learningAssignments.filter((la) => la.status === 'COMPLETED').length,
    overdue: learningAssignments.filter((la) => la.status === 'OVERDUE').length,
    weightedScore: learningCompletionScore,
  };

  const result = { overdueCount, blockedCount, dueTodayCount, kras, recentStandup, topBlockers, learningStats, memberCount: deptUsers.length };
  await setCache(ck, result, 30);
  res.json(result);
});

export default router;
