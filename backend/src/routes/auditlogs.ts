import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'));

// GET /api/audit-logs
// OWNER/COMPANY_ADMIN: all org logs
// DEPARTMENT_HEAD/MANAGER: only their department's users
router.get('/', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const role = req.user!.role;
  const { userId, entityType, action, from, to, page = '1', limit = '50' } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = Math.min(parseInt(limit as string), 100);

  // Dept heads / managers see only their department members
  let scopedUserIds: string[] | undefined;
  if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER') {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { departmentId: true },
    });
    if (me?.departmentId) {
      const deptUsers = await prisma.user.findMany({
        where: { orgId, departmentId: me.departmentId },
        select: { id: true },
      });
      scopedUserIds = deptUsers.map((u) => u.id);
    } else {
      scopedUserIds = [req.user!.userId];
    }
  }

  const where: Record<string, unknown> = { orgId };
  if (scopedUserIds) where.userId = { in: scopedUserIds };
  if (userId) where.userId = userId as string;
  if (entityType) where.entityType = entityType as string;
  if (action) where.action = action as string;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) dateFilter.lte = new Date(to as string);
    where.createdAt = dateFilter;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page: parseInt(page as string), limit: take });
});

export default router;
