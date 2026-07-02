import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { generateStandupDigest } from '../services/ai.service';
import { fanOutNotification } from '../services/notification.service';
import { generateMeetUrl } from '../services/meet.service';
import { getUserDeptAccess } from '../lib/deptAccess';

const router = Router();
router.use(authenticate);

// GET /standups?departmentId=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.query;
  const { orgId, userId, role } = req.user!;

  // Build dept filter — explicit param wins; otherwise scope by grant/role
  let deptWhere: Record<string, unknown> = {};
  if (departmentId) {
    deptWhere = { departmentId: departmentId as string };
  } else if (!['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) {
    const access = await getUserDeptAccess(userId, orgId, role);
    if (access?.accessType === 'FULL') {
      // no filter — can see all standups
    } else if (access?.accessType === 'SPECIFIC') {
      deptWhere = { departmentId: { in: access.departmentIds } };
    } else {
      // No grant — scope to own dept
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
      if (me?.departmentId) deptWhere = { departmentId: me.departmentId };
    }
  }

  const standups = await prisma.standup.findMany({
    where: { orgId, ...deptWhere },
    include: {
      department: { select: { id: true, name: true, slug: true } },
      _count: { select: { cards: true } },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 30,
  });
  res.json(standups);
});

// GET /standups/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const standup = await prisma.standup.findUnique({
    where: { id: req.params.id as string },
    include: {
      cards: {
        include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } },
      },
      department: true,
    },
  });

  if (!standup || standup.orgId !== req.user!.orgId) {
    res.status(404).json({ error: 'Standup not found' });
    return;
  }

  res.json(standup);
});

// POST /standups — create / schedule
router.post('/', async (req: AuthRequest, res: Response) => {
  const { departmentId, scheduledAt, meetUrl: manualMeetUrl } = req.body;
  const date = new Date(scheduledAt);

  // Use manually pasted link if provided; otherwise try Google Calendar integration
  let meetUrl: string | null | undefined = manualMeetUrl?.trim() || null;
  if (!meetUrl) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId as string },
      select: { slug: true, name: true, standupDuration: true },
    });
    meetUrl = dept
      ? await generateMeetUrl(req.user!.orgId, dept.slug, dept.name, date, dept.standupDuration ?? 15)
      : null;
  }

  const standup = await prisma.standup.create({
    data: {
      orgId: req.user!.orgId,
      departmentId,
      scheduledAt: date,
      meetUrl,
    },
  });
  res.status(201).json(standup);
});

// DELETE /standups/:id
router.delete('/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const standup = await prisma.standup.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, orgId: true, status: true },
  });
  if (!standup || standup.orgId !== req.user!.orgId) {
    res.status(404).json({ error: 'Standup not found' }); return;
  }
  if (standup.status === 'IN_PROGRESS') {
    res.status(400).json({ error: 'Cannot delete a standup that is in progress' }); return;
  }
  await prisma.standup.delete({ where: { id: standup.id } });
  res.json({ success: true });
});

// POST /standups/:id/start
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  const standup = await prisma.standup.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });
  res.json(standup);
});

// POST /standups/:id/end
router.post('/:id/end', async (req: AuthRequest, res: Response) => {
  const standup = await prisma.standup.findUnique({ where: { id: req.params.id as string } });
  if (!standup || standup.orgId !== req.user!.orgId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const endedAt = new Date();
  const overrun = standup.startedAt
    ? Math.max(0, (endedAt.getTime() - standup.startedAt.getTime()) / 60000 - standup.timerMinutes)
    : 0;

  const updated = await prisma.standup.update({
    where: { id: req.params.id as string },
    data: { status: 'COMPLETED', endedAt, overrunMinutes: overrun },
  });
  res.json(updated);

  // M5.7: trigger AI digest in background (T+60s)
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(async () => {
      try {
        const digest = await generateStandupDigest(standup.id);
        if (!digest || digest === 'Insufficient AI credits') return;

        const dept = await prisma.department.findUnique({
          where: { id: standup.departmentId },
          include: { users: { where: { status: 'ACTIVE' }, select: { id: true } } },
        });
        if (!dept) return;

        await prisma.standup.update({ where: { id: standup.id }, data: { aiDigestSent: true } });
        await fanOutNotification(
          standup.orgId,
          dept.users.map((u) => u.id),
          'STANDUP_REMINDER',
          { departmentName: dept.name, digest, time: '' }
        );
      } catch (e) {
        console.error('[standup-digest] error:', e);
      }
    }, 60_000);
  }
});

// PATCH /standups/:id/cards/:cardId — update own standup card
router.patch('/:id/cards/:cardId', async (req: AuthRequest, res: Response) => {
  const card = await prisma.standupCard.update({
    where: { id: req.params.cardId as string, standupId: req.params.id as string },
    data: {
      yesterdaySummary: req.body.yesterdaySummary,
      todayCommitments: req.body.todayCommitments,
      blockers: req.body.blockers,
      status: 'SUBMITTED',
    },
  });
  res.json(card);
});

// POST /standups/:id/cards — create card for a user
router.post('/:id/cards', async (req: AuthRequest, res: Response) => {
  const { userId } = req.body;
  const card = await prisma.standupCard.upsert({
    where: { standupId_userId: { standupId: req.params.id as string, userId: userId || req.user!.userId } },
    create: { standupId: req.params.id as string, userId: userId || req.user!.userId, ...req.body },
    update: req.body,
  });
  res.status(201).json(card);
});

export default router;
