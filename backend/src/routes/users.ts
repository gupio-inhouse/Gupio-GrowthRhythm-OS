import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { generateMagicLink } from '../services/magic-link.service';
import { sendMagicLinkEmail } from '../services/email.service';
import { encryptField, decryptField } from '../services/crypto.service';

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
  res.json(users.map((u) => ({ ...u, phone: decryptField(u.phone) })));
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

  res.json({ ...user, phone: decryptField(user.phone) });
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
        phone: encryptField(parsed.data.phone) ?? null,
        orgId: req.user!.orgId,
        status: 'INVITED',
        passwordHash,
      },
    });

    // Generate magic link and send invite email
    let emailSent = true;
    try {
      const purpose =
        parsed.data.role === 'DEPARTMENT_HEAD'
          ? ('DEPARTMENT_HEAD_INVITE' as const)
          : ('MEMBER_INVITE' as const);

      const { link } = await generateMagicLink({
        userId: user.id,
        orgId: req.user!.orgId,
        purpose,
        expiresInHours: 48,
      });

      await sendMagicLinkEmail({
        to: user.email,
        name: user.name,
        magicLinkUrl: link,
        purpose,
      });
    } catch (emailErr) {
      console.error('[users/invite] Failed to send invite email:', emailErr);
      emailSent = false;
    }

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailSent,
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
  const { name, phone, avatarUrl, departmentId, managerId, role, status, notificationPrefs } = req.body;

  const isOwnerOrAdmin = ['OWNER', 'COMPANY_ADMIN'].includes(req.user!.role);
  const isSelf = req.user!.userId === req.params.id;

  if (!isOwnerOrAdmin && !isSelf) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (phone !== undefined) data.phone = encryptField(phone);
  if (avatarUrl) data.avatarUrl = avatarUrl;
  if (notificationPrefs !== undefined) data.notificationPrefs = notificationPrefs;
  if (isOwnerOrAdmin && departmentId !== undefined) data.departmentId = departmentId;
  if (isOwnerOrAdmin && managerId !== undefined) data.managerId = managerId;
  if (isOwnerOrAdmin && role) data.role = role;
  if (isOwnerOrAdmin && status) data.status = status;

  const user = await prisma.user.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data,
    select: { id: true, name: true, email: true, role: true, status: true, phone: true, notificationPrefs: true },
  });

  res.json({ ...user, phone: decryptField(user.phone) });
});

// POST /users/bulk-import — CSV bulk user import (OWNER/ADMIN only)
router.post('/bulk-import', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { rows } = req.body as { rows: Array<Record<string, string>> };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows array required' });
    return;
  }

  const rowSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(['TEAM_MEMBER', 'MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN']).default('TEAM_MEMBER'),
    phone: z.string().optional(),
    departmentId: z.string().optional(),
  });

  const results = { created: 0, errors: [] as string[] };

  for (const row of rows.slice(0, 200)) {
    const parsed = rowSchema.safeParse({
      name: row.name,
      email: row.email?.toLowerCase(),
      role: row.role?.toUpperCase() || 'TEAM_MEMBER',
      phone: row.phone || undefined,
      departmentId: row.departmentId || undefined,
    });
    if (!parsed.success) {
      results.errors.push(`${row.email}: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
      continue;
    }
    try {
      const tempPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      await prisma.user.create({
        data: {
          ...parsed.data,
          phone: encryptField(parsed.data.phone) ?? null,
          orgId: req.user!.orgId,
          passwordHash: hashedPassword,
          status: 'INVITED',
        },
      });
      results.created++;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      results.errors.push(`${row.email}: ${code === 'P2002' ? 'Email already exists' : (e as Error).message}`);
    }
  }
  res.json(results);
});

export default router;
