import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /users
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, role } = req.query;
  const users = await prisma.user.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(departmentId ? { departmentId: departmentId as string } : {}),
      ...(role ? { role: role as never } : {}),
      status: { not: 'DEACTIVATED' },
    },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      departmentId: true, managerId: true, status: true, avatarUrl: true,
      lastLoginAt: true, createdAt: true,
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

// GET /users/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      departmentId: true, managerId: true, status: true, avatarUrl: true,
      lastLoginAt: true, createdAt: true,
      department: true,
      manager: { select: { id: true, name: true, email: true } },
      directReports: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

// POST /users/invite — invite a team member
const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER', 'COACH_ADVISOR']),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  phone: z.string().optional(),
});

router.post('/invite', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const tempPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        ...parsed.data,
        orgId: req.user!.orgId,
        status: 'INVITED',
        passwordHash,
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Email already exists in this organization' });
    } else {
      res.status(500).json({ error: 'Failed to invite user' });
    }
  }
});

// PATCH /users/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, phone, avatarUrl, departmentId, managerId, role, status } = req.body;

  const isOwnerOrAdmin = ['OWNER', 'COMPANY_ADMIN'].includes(req.user!.role);
  const isSelf = req.user!.userId === req.params.id;

  if (!isOwnerOrAdmin && !isSelf) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (phone) data.phone = phone;
  if (avatarUrl) data.avatarUrl = avatarUrl;
  if (isOwnerOrAdmin && departmentId !== undefined) data.departmentId = departmentId;
  if (isOwnerOrAdmin && managerId !== undefined) data.managerId = managerId;
  if (isOwnerOrAdmin && role) data.role = role;
  if (isOwnerOrAdmin && status) data.status = status;

  const user = await prisma.user.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  res.json(user);
});

export default router;
