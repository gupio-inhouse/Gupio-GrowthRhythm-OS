import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { generateLearningRecommendations } from '../services/ai.service';

const router = Router();
router.use(authenticate);

async function getActorScope(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true },
  });

  if (!actor) return null;

  let reportIds: string[] = [];
  if (actor.role === 'MANAGER') {
    const reports = await prisma.user.findMany({
      where: { managerId: actor.id },
      select: { id: true },
    });
    reportIds = reports.map((report) => report.id);
  }

  return { ...actor, reportIds };
}

// GET /learning/paths
router.get('/paths', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.query;
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const where: Record<string, unknown> = {
    orgId: req.user!.orgId,
    ...(departmentId ? { departmentId: departmentId as string } : {}),
    isActive: true,
  };

  if (['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(actor.role)) {
    where.OR = [{ departmentId: actor.departmentId }, { departmentId: null }];
  }

  const paths = await prisma.learningPath.findMany({
    where,
    include: {
      _count: { select: { items: true } },
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(paths);
});

// POST /learning/paths
router.post('/paths', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    departmentId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actor = await getActorScope(req.user!.userId);
    if (!actor?.departmentId || parsed.data.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Department heads can only create learning paths in their own department' });
      return;
    }
  }

  const path = await prisma.learningPath.create({
    data: { ...parsed.data, orgId: req.user!.orgId },
  });

  auditLog('learning', 'CREATE');
  res.status(201).json(path);
});

// GET /learning/paths/:id/items
router.get('/paths/:id/items', async (req: AuthRequest, res: Response) => {
  const items = await prisma.learningItem.findMany({
    where: { learningPathId: req.params.id as string },
    orderBy: { order: 'asc' },
  });
  res.json(items);
});

// POST /learning/paths/:id/items
router.post('/paths/:id/items', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    type: z.enum(['VIDEO', 'PDF', 'SOP', 'QUIZ', 'ASSIGNMENT', 'ROLE_PLAY', 'EXTERNAL_LINK', 'COACHING_NOTE']),
    title: z.string().min(2),
    description: z.string().optional(),
    contentUrl: z.string().optional(),
    estimatedMinutes: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const path = await prisma.learningPath.findFirst({
    where: { id: req.params.id as string, orgId: req.user!.orgId, isActive: true },
    select: { id: true, departmentId: true },
  });

  if (!path) {
    res.status(404).json({ error: 'Learning path not found' });
    return;
  }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actor = await getActorScope(req.user!.userId);
    if (!actor?.departmentId || path.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Department heads can only add items to their own department learning paths' });
      return;
    }
  }

  const item = await prisma.learningItem.create({
    data: { ...parsed.data, learningPathId: req.params.id as string },
  });

  auditLog('learning', 'CREATE');
  res.status(201).json(item);
});

// GET /learning/assignments — my assignments
router.get('/assignments', async (req: AuthRequest, res: Response) => {
  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const requestedUserId = (req.query.userId as string) || req.user!.userId;
  let userId = requestedUserId;

  if (actor.role === 'TEAM_MEMBER') {
    userId = actor.id;
  } else if (actor.role === 'MANAGER') {
    const visibleUserIds = new Set([actor.id, ...actor.reportIds]);
    if (!visibleUserIds.has(requestedUserId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  } else if (actor.role === 'DEPARTMENT_HEAD') {
    const target = await prisma.user.findFirst({
      where: { id: requestedUserId, orgId: req.user!.orgId },
      select: { departmentId: true },
    });

    if (!actor.departmentId || !target || target.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const assignments = await prisma.learningAssignment.findMany({
    where: { userId },
    include: {
      learningItem: {
        include: { learningPath: { select: { id: true, title: true } } },
      },
    },
    orderBy: { dueDate: 'asc' },
  });
  res.json(assignments);
});

// POST /learning/assignments — assign to user
router.post('/assignments', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  const { learningItemId, userId, dueDate } = req.body;

  const actor = await getActorScope(req.user!.userId);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, orgId: req.user!.orgId, status: 'ACTIVE' },
    select: { id: true, departmentId: true, managerId: true },
  });

  if (!targetUser) {
    res.status(400).json({ error: 'Target user not found' });
    return;
  }

  const item = await prisma.learningItem.findFirst({
    where: { id: learningItemId, learningPath: { orgId: req.user!.orgId, isActive: true } },
    include: { learningPath: { select: { departmentId: true } } },
  });

  if (!item) {
    res.status(400).json({ error: 'Learning item not found' });
    return;
  }

  if (actor.role === 'MANAGER') {
    const visibleUserIds = new Set([actor.id, ...actor.reportIds]);
    if (!visibleUserIds.has(targetUser.id)) {
      res.status(403).json({ error: 'Managers can only assign learning to themselves or their direct reports' });
      return;
    }
    if (actor.departmentId && targetUser.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Managers can only assign learning within their own department' });
      return;
    }
  }

  if (actor.role === 'DEPARTMENT_HEAD') {
    if (!actor.departmentId || targetUser.departmentId !== actor.departmentId) {
      res.status(403).json({ error: 'Department heads can only assign learning within their own department' });
      return;
    }
  }

  if (item.learningPath.departmentId && item.learningPath.departmentId !== targetUser.departmentId) {
    res.status(400).json({ error: 'Learning path department must match the target user department' });
    return;
  }

  const assignment = await prisma.learningAssignment.create({
    data: {
      learningItemId,
      userId,
      assignedBy: req.user!.userId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });

  auditLog('learning', 'CREATE');
  res.status(201).json(assignment);
});

// PATCH /learning/assignments/:id/complete
router.patch('/assignments/:id/complete', async (req: AuthRequest, res: Response) => {
  const assignment = await prisma.learningAssignment.update({
    where: { id: req.params.id as string, userId: req.user!.userId },
    data: { status: 'COMPLETED', completedAt: new Date(), score: req.body.score },
  });
  res.json(assignment);
});

// GET /learning/ai-recommend — M7.5: personalised learning recommendations
router.get('/ai-recommend', async (req: AuthRequest, res: Response) => {
  const recommendations = await generateLearningRecommendations(
    req.user!.userId,
    req.user!.orgId
  );
  res.json({ recommendations });
});

// GET /learning/:departmentSlug/dashboard
router.get('/:departmentSlug/dashboard', async (req: AuthRequest, res: Response) => {
  const dept = await prisma.department.findUnique({
    where: { orgId_slug: { orgId: req.user!.orgId, slug: req.params.departmentSlug as string } },
    select: { id: true },
  });

  if (!dept) {
    res.status(404).json({ error: 'Department not found' });
    return;
  }

  if (['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(req.user!.role)) {
    const actor = await getActorScope(req.user!.userId);
    if (!actor?.departmentId || actor.departmentId !== dept.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const users = await prisma.user.findMany({
    where: { departmentId: dept.id, status: 'ACTIVE' },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const [totalAssigned, completed, overdue] = await Promise.all([
    prisma.learningAssignment.count({ where: { userId: { in: userIds } } }),
    prisma.learningAssignment.count({ where: { userId: { in: userIds }, status: 'COMPLETED' } }),
    prisma.learningAssignment.count({
      where: {
        userId: { in: userIds },
        status: { not: 'COMPLETED' },
        dueDate: { lt: new Date() },
      },
    }),
  ]);

  res.json({
    totalAssigned,
    completed,
    overdue,
    completionRate: totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0,
  });
});

// DELETE /learning/paths/:id
router.delete('/paths/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const path = await prisma.learningPath.findFirst({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, departmentId: true },
  });
  if (!path) { res.status(404).json({ error: 'Learning path not found' }); return; }

  if (req.user!.role === 'DEPARTMENT_HEAD') {
    const actor = await getActorScope(req.user!.userId);
    if (actor?.departmentId !== path.departmentId) {
      res.status(403).json({ error: 'You can only delete learning paths in your department' });
      return;
    }
  }

  await prisma.learningPath.delete({ where: { id: req.params.id as string } });
  res.json({ success: true });
});

// DELETE /learning/items/:id
router.delete('/items/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const item = await prisma.learningItem.findFirst({
    where: { id: req.params.id as string, learningPath: { orgId: req.user!.orgId } },
    select: { id: true },
  });
  if (!item) { res.status(404).json({ error: 'Learning item not found' }); return; }

  await prisma.learningItem.delete({ where: { id: req.params.id as string } });
  res.json({ success: true });
});

export default router;
