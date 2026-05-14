import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /standups?departmentId=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.query;
  const standups = await prisma.standup.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(departmentId ? { departmentId: departmentId as string } : {}),
    },
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
  const { departmentId, scheduledAt } = req.body;
  const standup = await prisma.standup.create({
    data: {
      orgId: req.user!.orgId,
      departmentId,
      scheduledAt: new Date(scheduledAt),
    },
  });
  res.status(201).json(standup);
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
