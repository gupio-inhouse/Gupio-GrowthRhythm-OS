import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { getFailedNotifications } from '../services/notification.service';

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

// GET /notifications/failed — M10.6: admin view of failed notifications
router.get('/failed', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const failed = await getFailedNotifications(req.user!.orgId);
  res.json(failed);
});

// PATCH /notifications/:id/retry — M10.5: manually retry a failed notification
router.patch('/:id/retry', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, userId: true, type: true, payload: true, retryCount: true },
  });
  if (!notif) { res.status(404).json({ error: 'Not found' }); return; }
  if ((notif.retryCount ?? 0) >= 3) { res.status(400).json({ error: 'Max retries exceeded' }); return; }

  await prisma.notification.update({
    where: { id: notif.id },
    data: { status: 'SCHEDULED', retryCount: { increment: 1 }, errorMessage: null },
  });
  res.json({ success: true });
});

// GET /notifications/settings — M10.4: get org quiet hours
router.get('/settings', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.orgId },
    select: { quietHoursStart: true, quietHoursEnd: true },
  });
  res.json(org ?? { quietHoursStart: 22, quietHoursEnd: 7 });
});

// PATCH /notifications/settings — M10.4: update quiet hours
router.patch('/settings', requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { quietHoursStart, quietHoursEnd } = req.body as { quietHoursStart?: number; quietHoursEnd?: number };
  const org = await prisma.organization.update({
    where: { id: req.user!.orgId },
    data: { quietHoursStart, quietHoursEnd },
    select: { quietHoursStart: true, quietHoursEnd: true },
  });
  res.json(org);
});

export default router;
