import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { getCache, setCache, invalidateCache, cacheKey } from '../lib/cache';
import { getUserDeptAccess } from '../lib/deptAccess';

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

// GET /departments — owners/admins see all; others filtered by grant or own dept
router.get('/', async (req: AuthRequest, res: Response) => {
  const { role, userId, orgId } = req.user!;

  // Build the department id filter based on role + grant
  let idFilter: { in: string[] } | undefined;

  if (!['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) {
    const access = await getUserDeptAccess(userId, orgId, role);

    if (access?.accessType === 'FULL') {
      // Grant gives full view — no id filter
    } else {
      // Fetch user's own dept memberships regardless (needed for both SPECIFIC and no-grant)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true, headOfDepartments: { select: { id: true } } },
      });
      const ownDepts = new Set<string>(user?.headOfDepartments.map((d) => d.id) ?? []);
      if (user?.departmentId) ownDepts.add(user.departmentId);

      if (access?.accessType === 'SPECIFIC' && access.departmentIds.length > 0) {
        // SPECIFIC grant + own dept(s) — user must always be able to see their own department
        idFilter = { in: [...new Set([...access.departmentIds, ...ownDepts])] };
      } else {
        // No grant — own dept(s) only
        idFilter = { in: [...ownDepts] };
      }
    }
  }

  const ck = idFilter
    ? cacheKey('depts', orgId, userId)
    : cacheKey('depts', orgId);
  const cached = await getCache(ck);
  if (cached) { res.json(cached); return; }

  const departments = await prisma.department.findMany({
    where: {
      orgId,
      isActive: true,
      ...(idFilter ? { id: idFilter } : {}),
    },
    include: {
      head: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { users: true, tasks: true } },
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
      _count: { select: { tasks: true, standups: true } },
    },
  });

  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  if (!['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(req.user!.role)) {
    const access = await getUserDeptAccess(req.user!.userId, req.user!.orgId, req.user!.role);
    if (access?.accessType === 'FULL') {
      // Grant allows viewing all departments
    } else {
      // Always check own dept — user must always access the dept they belong to
      const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
      const isOwnDept = !!actorDepartmentId && actorDepartmentId === dept.id;
      if (!isOwnDept) {
        if (access?.accessType === 'SPECIFIC') {
          if (!access.departmentIds.includes(dept.id)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
          }
        } else {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
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

  // Whitelist updatable fields to prevent inadvertent overwrites
  const { name, slug, headUserId, standupTime, standupDuration, standupMeetUrl, isActive } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined)              data.name = name;
  if (slug !== undefined)              data.slug = slug;
  if (headUserId !== undefined)        data.headUserId = headUserId ?? null;
  if (standupTime !== undefined)       data.standupTime = standupTime;
  if (standupDuration !== undefined)   data.standupDuration = standupDuration;
  if (standupMeetUrl !== undefined)    data.standupMeetUrl = standupMeetUrl;
  if (isActive !== undefined)          data.isActive = isActive;

  const dept = await prisma.department.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
  });

  // Keep data consistent: when a new head is assigned, move them into this department
  if (data.headUserId) {
    await prisma.user.update({
      where: { id: data.headUserId as string },
      data: { departmentId: req.params.id as string },
    });
  }

  await invalidateCache(`depts:${req.user!.orgId}`);
  res.json(dept);
});

// DELETE /departments/:id
router.delete('/:id', requireRole('OWNER', 'COMPANY_ADMIN'), auditLog('department', 'DELETE'), async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, _count: { select: { users: true, tasks: true } } },
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

  if (!['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(req.user!.role)) {
    const access = await getUserDeptAccess(req.user!.userId, req.user!.orgId, req.user!.role);
    if (access?.accessType === 'FULL') {
      // full grant — allowed
    } else {
      const actorDepartmentId = await getActorDepartmentId(req.user!.userId);
      const isOwnDept = !!actorDepartmentId && actorDepartmentId === dept.id;
      if (!isOwnDept) {
        if (access?.accessType === 'SPECIFIC') {
          if (!access.departmentIds.includes(dept.id)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
          }
        } else {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
    }
  }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const [overdueCount, blockedCount, dueTodayCount, recentStandup, topBlockers, deptUsers] = await Promise.all([
    prisma.task.count({ where: { departmentId: dept.id, status: { notIn: ['DONE', 'CANCELLED', 'IN_REVIEW'] }, dueDate: { lt: now } } }),
    prisma.task.count({ where: { departmentId: dept.id, status: 'BLOCKED' } }),
    prisma.task.count({ where: { departmentId: dept.id, dueDate: { gte: todayStart, lt: todayEnd }, status: { notIn: ['DONE', 'CANCELLED'] } } }),
    prisma.standup.findFirst({ where: { departmentId: dept.id }, orderBy: { scheduledAt: 'desc' }, include: { _count: { select: { cards: true } } } }),
    prisma.task.groupBy({ by: ['blockerType'], where: { departmentId: dept.id, status: 'BLOCKED', blockerType: { not: null } }, _count: true, orderBy: { _count: { blockerType: 'desc' } }, take: 5 }),
    prisma.user.findMany({ where: { departmentId: dept.id, status: 'ACTIVE' }, select: { id: true } }),
  ]);

  const result = { overdueCount, blockedCount, dueTodayCount, recentStandup, topBlockers, memberCount: deptUsers.length };
  await setCache(ck, result, 30);
  res.json(result);
});

export default router;
