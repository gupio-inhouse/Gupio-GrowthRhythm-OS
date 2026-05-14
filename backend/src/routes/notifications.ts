import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /notifications — user's unread in-app notifications
router.get('/', async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: {
      userId: req.user!.userId,
      channel: 'DASHBOARD',
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

// GET /notifications/unread-count
router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: {
      userId: req.user!.userId,
      channel: 'DASHBOARD',
      openedAt: null,
    },
  });
  res.json({ count });
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.userId },
    data: { openedAt: new Date(), status: 'OPENED' },
  });
  res.json(notif);
});

// PATCH /notifications/read-all
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, openedAt: null },
    data: { openedAt: new Date(), status: 'OPENED' },
  });
  res.json({ success: true });
});

export default router;
