import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { fanOutNotification, createNotification } from '../services/notification.service';
import { getUserDeptAccess } from '../lib/deptAccess';
import { sendReviewInvitationEmail } from '../services/email.service';

const router = Router();
router.use(authenticate);

const MUTATE_ROLES = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'];

// Resolve which department(s) an actor may see review/goal data for.
// Mirrors the standups.ts dept-scoping pattern: explicit param wins, otherwise
// scope by grant/role, falling back to the actor's own department.
async function resolveDeptScope(userId: string, orgId: string, role: string, requestedDeptId?: string) {
  if (requestedDeptId) return { type: 'explicit' as const, departmentIds: [requestedDeptId] };
  if (['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) return { type: 'all' as const };

  const access = await getUserDeptAccess(userId, orgId, role);
  if (access?.accessType === 'FULL') return { type: 'all' as const };
  if (access?.accessType === 'SPECIFIC') return { type: 'specific' as const, departmentIds: access.departmentIds };

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  return me?.departmentId ? { type: 'specific' as const, departmentIds: [me.departmentId] } : { type: 'none' as const };
}

async function canAccessDepartment(userId: string, orgId: string, role: string, departmentId: string | null) {
  if (!departmentId) return ['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role);
  const scope = await resolveDeptScope(userId, orgId, role);
  if (scope.type === 'all') return true;
  if (scope.type === 'specific') return scope.departmentIds.includes(departmentId);
  return false;
}

const participantSelect = {
  id: true,
  invitedAt: true,
  attended: true,
  attendedAt: true,
  user: { select: { id: true, name: true, avatarUrl: true, role: true } },
} as const;

const goalSelect = {
  id: true,
  cycle: true,
  title: true,
  description: true,
  startDate: true,
  targetDate: true,
  status: true,
  progressPercent: true,
  parentGoalId: true,
  createdBy: { select: { id: true, name: true } },
  attachments: {
    select: { id: true, name: true, url: true, size: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} as const;

// GET /reviews?departmentId=&type=TACTICAL|STRATEGIC
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, type } = req.query;
  const { orgId, userId, role } = req.user!;

  const scope = await resolveDeptScope(userId, orgId, role, departmentId as string | undefined);
  if (scope.type === 'none') {
    res.json([]);
    return;
  }

  const where: Record<string, unknown> = { orgId };
  if (scope.type !== 'all') where.departmentId = { in: scope.departmentIds };
  if (type) where.type = type;

  const reviews = await prisma.review.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, slug: true } },
      participants: { select: participantSelect },
      goals: { select: goalSelect },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 60,
  });
  res.json(reviews);
});

// GET /reviews/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const review = await prisma.review.findUnique({
    where: { id: req.params.id as string, orgId },
    include: {
      department: { select: { id: true, name: true, slug: true } },
      participants: { select: participantSelect },
      goals: { select: { ...goalSelect, subGoals: { select: goalSelect } } },
    },
  });
  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  if (!(await canAccessDepartment(userId, orgId, role, review.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(review);
});

const createSchema = z.object({
  type: z.enum(['TACTICAL', 'STRATEGIC', 'ONE_ON_ONE', 'DEPARTMENT']),
  departmentId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  mode: z.enum(['ONLINE', 'OFFLINE']).optional(),
  agenda: z.string().optional(),
});

// POST /reviews — manual scheduling (auto-creation is normally handled by the recurrence worker)
router.post('/', auditLog('review', 'CREATE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  if (!MUTATE_ROLES.includes(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await canAccessDepartment(userId, orgId, role, parsed.data.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const dept = await prisma.department.findFirst({
    where: { id: parsed.data.departmentId, orgId },
    include: { users: { where: { status: 'ACTIVE' }, select: { id: true } } },
  });
  if (!dept) {
    res.status(400).json({ error: 'Department not found' });
    return;
  }

  const review = await prisma.review.create({
    data: {
      orgId,
      type: parsed.data.type,
      departmentId: dept.id,
      scheduledAt: parsed.data.scheduledAt,
      mode: parsed.data.mode,
      agenda: parsed.data.agenda,
      createdBy: userId,
      participants: {
        create: dept.users.map((u) => ({ userId: u.id })),
      },
    },
    include: {
      department: { select: { id: true, name: true } },
      participants: { select: participantSelect },
    },
  });

  await sendReviewInvitations(review.id).catch((e) => console.error('[reviews] invitation send failed:', e));

  res.status(201).json(review);
});

const updateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  conductedAt: z.coerce.date().optional(),
  mode: z.enum(['ONLINE', 'OFFLINE']).optional(),
  agenda: z.string().optional(),
  decisions: z.string().optional(),
  actionItems: z.unknown().optional(),
});

// PATCH /reviews/:id — record agenda/decisions/outcome
router.patch('/:id', auditLog('review', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const existing = await prisma.review.findUnique({ where: { id: req.params.id as string, orgId } });
  if (!existing) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  if (!MUTATE_ROLES.includes(role) || !(await canAccessDepartment(userId, orgId, role, existing.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const review = await prisma.review.update({
    where: { id: existing.id },
    data: parsed.data as Record<string, unknown>,
    include: {
      department: { select: { id: true, name: true } },
      participants: { select: participantSelect },
      goals: { select: goalSelect },
    },
  });
  res.json(review);
});

// DELETE /reviews/:id
router.delete('/:id', auditLog('review', 'DELETE'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const existing = await prisma.review.findUnique({ where: { id: req.params.id as string, orgId } });
  if (!existing) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  if (!MUTATE_ROLES.includes(role) || !(await canAccessDepartment(userId, orgId, role, existing.departmentId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await prisma.review.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

// PATCH /reviews/:id/participants/:participantId — mark attendance (self, or dept head/manager/owner for anyone)
router.patch('/:id/participants/:participantId', async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const participant = await prisma.reviewParticipant.findUnique({
    where: { id: req.params.participantId as string },
    include: { review: true },
  });
  if (!participant || participant.review.orgId !== orgId || participant.reviewId !== req.params.id) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }

  const isSelf = participant.userId === userId;
  const isManagerLike = MUTATE_ROLES.includes(role) && (await canAccessDepartment(userId, orgId, role, participant.review.departmentId));
  if (!isSelf && !isManagerLike) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { attended } = req.body as { attended?: boolean };
  const updated = await prisma.reviewParticipant.update({
    where: { id: participant.id },
    data: { attended: !!attended, attendedAt: attended ? new Date() : null },
    select: participantSelect,
  });
  res.json(updated);
});

// Shared by the manual create route and the recurrence worker.
export async function sendReviewInvitations(_reviewId: string) {
  // Disabled as per user request to stop review meeting emails and invites
  return;
}

// Shared by the reminder cron worker.
export async function sendReviewReminders(_reviewId: string) {
  // Disabled as per user request to stop review meeting reminders
  return;
}

export default router;
