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

async function getViewerScope(userId: string) {
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true },
  });

  return viewer;
}

function canViewUserDirectory(viewerRole: string) {
  return ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(viewerRole);
}

function canAccessUser(viewer: { id: string; role: string; departmentId: string | null }, target: { id: string; departmentId: string | null }) {
  if (['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(viewer.role)) return true;
  if (viewer.role === 'TEAM_MEMBER') return viewer.id === target.id;
  return !!viewer.departmentId && viewer.departmentId === target.departmentId;
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfWeek() {
  return new Date(Date.now() - 7 * 86400000);
}

function formatCsvValue(value: unknown) {
  const stringValue = value == null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function createCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => formatCsvValue(row[header])).join(',')),
  ];
  return lines.join('\n');
}

// GET /users
router.get('/', async (req: AuthRequest, res: Response) => {
  const viewer = await getViewerScope(req.user!.userId);
  if (!viewer || !canViewUserDirectory(viewer.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { departmentId, role } = req.query;
  const where: Record<string, unknown> = {
    orgId: req.user!.orgId,
    ...(departmentId ? { departmentId: departmentId as string } : {}),
    ...(role ? { role: role as never } : {}),
    status: { not: 'DEACTIVATED' },
  };

  if (viewer.role === 'TEAM_MEMBER') {
    where.id = viewer.id;
  } else if (['MANAGER', 'DEPARTMENT_HEAD'].includes(viewer.role)) {
    if (!viewer.departmentId) {
      res.json([]);
      return;
    }
    where.departmentId = viewer.departmentId;
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      departmentId: true, managerId: true, status: true, avatarUrl: true,
      lastLoginAt: true, createdAt: true,
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(
    users.map((u) => ({
      ...u,
      phone: ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(viewer.role) || u.id === viewer.id
        ? decryptField(u.phone)
        : null,
    }))
  );
});

// GET /users/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const viewer = await getViewerScope(req.user!.userId);
  if (!viewer) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

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

  if (!canAccessUser(viewer, user)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.json({
    ...user,
    phone: ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(viewer.role) || user.id === viewer.id
      ? decryptField(user.phone)
      : null,
  });
});

// GET /users/:id/report
router.get('/:id/report', async (req: AuthRequest, res: Response) => {
  const viewer = await getViewerScope(req.user!.userId);
  if (!viewer) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      departmentId: true,
      department: { select: { id: true, name: true, slug: true } },
      manager: { select: { id: true, name: true, email: true } },
      directReports: { select: { id: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (!canAccessUser(viewer, user)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const weekStart = startOfWeek();

  const tasks = await prisma.task.findMany({
    where: { orgId: req.user!.orgId, assigneeUserId: user.id },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      completedAt: true,
      blockerType: true,
      blockerCount: true,
      expectedOutcome: true,
      description: true,
      kra: { select: { id: true, name: true, status: true } },
      department: { select: { id: true, name: true, slug: true } },
      dependency: { select: { id: true, title: true, status: true } },
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === 'DONE').length;
  const inProgressTasks = tasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const blockedTasks = tasks.filter((task) => task.status === 'BLOCKED').length;
  const todoTasks = tasks.filter((task) => task.status === 'TODO').length;
  const cancelledTasks = tasks.filter((task) => task.status === 'CANCELLED').length;
  const overdueTasks = tasks.filter((task) =>
    !!task.dueDate &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED' &&
    task.dueDate < todayStart
  ).length;
  const dueTodayTasks = tasks.filter((task) =>
    !!task.dueDate &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED' &&
    task.dueDate >= todayStart &&
    task.dueDate <= todayEnd
  ).length;
  const completedThisWeek = tasks.filter((task) => !!task.completedAt && task.completedAt >= weekStart).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const priorityCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.priority] = (acc[task.priority] || 0) + 1;
    return acc;
  }, {});

  const tasksByKra = Object.values(tasks.reduce<Record<string, {
    kraId: string;
    kraName: string;
    kraStatus: string;
    total: number;
    done: number;
  }>>((acc, task) => {
    if (!task.kra) return acc;
    const existing = acc[task.kra.id] || {
      kraId: task.kra.id,
      kraName: task.kra.name,
      kraStatus: task.kra.status,
      total: 0,
      done: 0,
    };
    existing.total += 1;
    if (task.status === 'DONE') existing.done += 1;
    acc[task.kra.id] = existing;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  const recentTasks = tasks
    .slice()
    .sort((a, b) => {
      const aDate = a.dueDate?.getTime() ?? a.createdAt.getTime();
      const bDate = b.dueDate?.getTime() ?? b.createdAt.getTime();
      return aDate - bDate;
    })
    .slice(0, 12);

  res.json({
    user,
    summary: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      blockedTasks,
      todoTasks,
      cancelledTasks,
      overdueTasks,
      dueTodayTasks,
      completedThisWeek,
      completionRate,
    },
    priorityCounts: {
      LOW: priorityCounts.LOW || 0,
      MEDIUM: priorityCounts.MEDIUM || 0,
      HIGH: priorityCounts.HIGH || 0,
      CRITICAL: priorityCounts.CRITICAL || 0,
    },
    tasksByKra,
    recentTasks,
  });
});

// GET /users/:id/report/export-csv
router.get('/:id/report/export-csv', async (req: AuthRequest, res: Response) => {
  const viewer = await getViewerScope(req.user!.userId);
  if (!viewer) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      department: { select: { name: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (!canAccessUser(viewer, user)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const todayStart = startOfToday();
  const tasks = await prisma.task.findMany({
    where: { orgId: req.user!.orgId, assigneeUserId: user.id },
    select: {
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      blockerType: true,
      blockerCount: true,
      kra: { select: { name: true } },
      department: { select: { name: true } },
      dependency: { select: { title: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const csv = createCsv(tasks.map((task) => ({
    employeeName: user.name,
    employeeEmail: user.email,
    employeeRole: user.role,
    department: task.department?.name || user.department?.name || '',
    taskTitle: task.title,
    status: task.status,
    priority: task.priority,
    kra: task.kra?.name || '',
    dependency: task.dependency?.title || '',
    blockerType: task.blockerType || '',
    blockerCount: task.blockerCount,
    dueDate: task.dueDate?.toISOString() || '',
    completedAt: task.completedAt?.toISOString() || '',
    createdAt: task.createdAt.toISOString(),
    isOverdue: !!task.dueDate && task.status !== 'DONE' && task.status !== 'CANCELLED' && task.dueDate < todayStart ? 'YES' : 'NO',
  })));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.csv"`);
  res.send(csv);
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

router.post('/invite', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    let inviteData = { ...parsed.data };

    if (req.user!.role === 'MANAGER') {
      if (inviteData.role !== 'TEAM_MEMBER') {
        res.status(403).json({ error: 'Managers can only invite team members' });
        return;
      }

      const manager = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { departmentId: true },
      });

      if (!manager?.departmentId) {
        res.status(400).json({ error: 'Manager must belong to a department before inviting team members' });
        return;
      }

      inviteData = {
        ...inviteData,
        departmentId: manager.departmentId,
        managerId: req.user!.userId,
      };
    }

    const tempPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        ...inviteData,
        phone: encryptField(inviteData.phone) ?? null,
        orgId: req.user!.orgId,
        status: 'INVITED',
        passwordHash,
      },
    });

    // Generate magic link and send invite email
    let emailSent = false;
    let inviteLink: string | null = null;
    try {
      const purpose =
        inviteData.role === 'DEPARTMENT_HEAD'
          ? ('DEPARTMENT_HEAD_INVITE' as const)
          : ('MEMBER_INVITE' as const);

      const { link } = await generateMagicLink({
        userId: user.id,
        orgId: req.user!.orgId,
        purpose,
        expiresInHours: 48,
      });
      inviteLink = link;

      emailSent = await sendMagicLinkEmail({
        to: user.email,
        name: user.name,
        magicLinkUrl: link,
        purpose,
      });
    } catch (emailErr) {
      const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error('[users/invite] Failed to send invite email:', errMsg);
      emailSent = false;
    }

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailSent,
      inviteLink,
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

// DELETE /users/:id — hard delete (OWNER/ADMIN only, cannot delete self or another OWNER)
router.delete('/:id', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const targetId = req.params.id as string;

  if (targetId === req.user!.userId) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  const target = await prisma.user.findFirst({
    where: { id: targetId, orgId: req.user!.orgId },
    select: { id: true, role: true },
  });

  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (target.role === 'OWNER') {
    res.status(403).json({ error: 'Cannot delete an organization owner' });
    return;
  }

  await prisma.user.delete({ where: { id: targetId } });
  res.json({ success: true });
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
