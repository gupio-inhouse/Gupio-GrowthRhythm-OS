import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { generateLearningRecommendations } from '../services/ai.service';

const router = Router();
router.use(authenticate);

// GET /learning/paths
router.get('/paths', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.query;
  const paths = await prisma.learningPath.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(departmentId ? { departmentId: departmentId as string } : {}),
      isActive: true,
    },
    include: {
      _count: { select: { items: true } },
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(paths);
});

// POST /learning/paths
router.post('/paths', async (req: AuthRequest, res: Response) => {
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
router.post('/paths/:id/items', async (req: AuthRequest, res: Response) => {
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

  const item = await prisma.learningItem.create({
    data: { ...parsed.data, learningPathId: req.params.id as string },
  });

  auditLog('learning', 'CREATE');
  res.status(201).json(item);
});

// GET /learning/assignments — my assignments
router.get('/assignments', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.role === 'TEAM_MEMBER' ? req.user!.userId : (req.query.userId as string) || req.user!.userId;

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
router.post('/assignments', async (req: AuthRequest, res: Response) => {
  const { learningItemId, userId, dueDate } = req.body;

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

export default router;
