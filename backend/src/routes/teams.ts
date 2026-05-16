import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  departmentId: z.string(),
  managerUserId: z.string().optional(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const { orgId, role, userId } = req.user!;

  let departmentId: string | undefined;
  if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER') {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    departmentId = me?.departmentId ?? undefined;
  }

  const teams = await prisma.team.findMany({
    where: {
      orgId,
      isActive: true,
      ...(departmentId ? { departmentId } : {}),
    },
    include: {
      department: { select: { id: true, name: true, slug: true } },
      manager: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          _count: { select: { directReports: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json(
    teams.map((team) => ({
      ...team,
      memberCount: team.manager?._count.directReports ?? 0,
    }))
  );
});

router.post(
  '/',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'),
  auditLog('team', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { orgId, role, userId } = req.user!;

    const department = await prisma.department.findFirst({
      where: { id: parsed.data.departmentId, orgId, isActive: true },
      select: { id: true },
    });

    if (!department) {
      res.status(400).json({ error: 'Department not found' });
      return;
    }

    if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER') {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (!me?.departmentId || me.departmentId !== parsed.data.departmentId) {
        res.status(403).json({ error: 'You can only create teams in your own department' });
        return;
      }
    }

    if (parsed.data.managerUserId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: parsed.data.managerUserId,
          orgId,
          departmentId: parsed.data.departmentId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!manager) {
        res.status(400).json({ error: 'Manager must be an active user in the selected department' });
        return;
      }
    }

    try {
      const team = await prisma.team.create({
        data: {
          ...parsed.data,
          orgId,
        },
        include: {
          department: { select: { id: true, name: true, slug: true } },
          manager: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      });

      res.status(201).json({
        ...team,
        memberCount: 0,
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Team slug already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create team' });
      }
    }
  }
);

export default router;
