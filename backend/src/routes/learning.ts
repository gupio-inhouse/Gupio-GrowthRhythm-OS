import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { getCache, setCache, invalidateCache, cacheKey } from '../lib/cache';
import { callClaude, deductAiCredits } from '../services/ai.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import { Prisma } from '@prisma/client';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'] as const;

function canManageModule(
  role: string,
  userDeptId: string | null | undefined,
  moduleDeptId: string | null | undefined,
): boolean {
  if (role === 'OWNER' || role === 'COMPANY_ADMIN') return true;
  if (role === 'DEPARTMENT_HEAD') {
    if (!moduleDeptId) return false;
    return moduleDeptId === userDeptId;
  }
  return false;
}

function invalidateLearningCache(orgId: string) {
  invalidateCache(cacheKey('learning:modules', orgId));
  invalidateCache(cacheKey('learning:my', orgId));
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const moduleSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  type: z.enum(['ONBOARDING', 'COMPLIANCE', 'SKILLS', 'PRODUCT', 'PROCESS', 'CERTIFICATION', 'OTHER']).default('OTHER'),
  isMandatory: z.boolean().default(false),
  passScore: z.number().int().min(0).max(100).default(70),
  durationDays: z.number().int().positive().optional().nullable(),
  order: z.number().int().default(0),
});

const phaseSchema = z.object({
  title: z.string().min(1).max(200),
  phaseNumber: z.number().int().positive(),
  color: z.string().optional(),
  dayStart: z.number().int().optional().nullable(),
  dayEnd: z.number().int().optional().nullable(),
  order: z.number().int().default(0),
});

const lessonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  phaseId: z.string().optional().nullable(),
  contentType: z.enum(['VIDEO', 'PDF', 'ARTICLE', 'QUIZ', 'EMBED', 'CHECKPOINT']),
  contentUrl: z.string().url().optional().nullable(),
  contentBody: z.string().optional().nullable(),
  notesUrl: z.string().url().optional().nullable(),
  topics: z.array(z.string()).optional(),
  dayStart: z.number().int().optional().nullable(),
  dayEnd: z.number().int().optional().nullable(),
  checkpointItems: z.array(z.string()).optional().nullable(),
  durationMins: z.number().int().positive().optional().nullable(),
  order: z.number().int().default(0),
  isRequired: z.boolean().default(true),
});

const quizSchema = z.object({
  question: z.string().min(5),
  options: z.array(z.string()).min(2).max(6),
  correctAnswer: z.number().int().min(0),
  explanation: z.string().optional(),
  points: z.number().int().positive().default(1),
  order: z.number().int().default(0),
});

const enrollSchema = z.object({
  userIds: z.array(z.string()).min(1),
  dueDate: z.string().datetime().optional().nullable(),
});

const progressSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  timeSpentSec: z.number().int().min(0).optional(),
  videoPosition: z.number().int().min(0).optional(),
  quizScore: z.number().min(0).max(100).optional(),
  quizAttempts: z.number().int().min(0).optional(),
  quizAnswers: z.array(z.number().int()).optional(),
});

const heartbeatSchema = z.object({
  enrollmentId: z.string(),
  seconds: z.number().int().min(1).max(120),
  videoPosition: z.number().int().min(0).optional(),
});

// ─── Module CRUD ──────────────────────────────────────────────────────────────

// GET /learning/modules — scoped by role (published only)
router.get('/modules', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;

  const ck = cacheKey('learning:modules', orgId, (role === 'OWNER' || role === 'COMPANY_ADMIN') ? 'all' : userId);
  const cached = await getCache(ck);
  if (cached) { res.json(cached); return; }

  let where: Prisma.LearningModuleWhereInput = { orgId, isActive: true, isPublished: true };

  if (role === 'DEPARTMENT_HEAD' || role === 'MANAGER' || role === 'TEAM_MEMBER') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (user?.departmentId) {
      where = { ...where, OR: [{ departmentId: user.departmentId }, { departmentId: null }] };
    }
  }

  const modules = await prisma.learningModule.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { lessons: true, enrollments: true, phases: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });

  await setCache(ck, modules, 60);
  res.json(modules);
});

// GET /learning/modules/admin — admin view (includes drafts)
router.get('/modules/admin', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;

  let where: Prisma.LearningModuleWhereInput = { orgId, isActive: true };

  if (role === 'DEPARTMENT_HEAD') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (user?.departmentId) {
      where = { ...where, OR: [{ departmentId: user.departmentId }, { departmentId: null }] };
    }
  }

  const modules = await prisma.learningModule.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { lessons: true, enrollments: true, phases: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(modules);
});

// POST /learning/modules
router.post(
  '/modules',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  auditLog('LearningModule', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    const parsed = moduleSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { role, orgId, userId } = req.user!;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });

    const data = parsed.data;

    if (role === 'DEPARTMENT_HEAD') {
      if (data.departmentId && data.departmentId !== user?.departmentId) {
        res.status(403).json({ error: 'Department heads can only create modules for their own department' });
        return;
      }
      data.departmentId = user?.departmentId ?? null;
    }

    const module = await prisma.learningModule.create({
      data: {
        orgId,
        createdById: userId,
        title: data.title,
        description: data.description,
        departmentId: data.departmentId ?? null,
        type: data.type,
        isMandatory: data.isMandatory,
        passScore: data.passScore,
        durationDays: data.durationDays ?? null,
        order: data.order,
      },
    });

    invalidateLearningCache(orgId);
    res.status(201).json(module);
  }
);

// POST /learning/modules/import-pdf — must come before /:id routes
router.post(
  '/modules/import-pdf',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  upload.single('pdf'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, userId, role } = req.user!;

    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });

    let departmentId: string | null = (req.body.departmentId as string) || null;
    if (role === 'DEPARTMENT_HEAD') {
      departmentId = user?.departmentId ?? null;
    }

    let pdfText: string;
    try {
      const parsedPdf = await pdfParse(req.file.buffer);
      pdfText = parsedPdf.text.slice(0, 40000);
    } catch {
      res.status(400).json({ error: 'Could not parse PDF' }); return;
    }

    const prompt = `You are a training module architect. Extract a structured learning module from the following PDF content.

Return ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "title": "string",
  "description": "string",
  "type": "ONBOARDING|COMPLIANCE|SKILLS|PRODUCT|PROCESS|CERTIFICATION|OTHER",
  "durationDays": number | null,
  "phases": [
    {
      "title": "string",
      "phaseNumber": number,
      "color": "string (hex)",
      "dayStart": number | null,
      "dayEnd": number | null,
      "lessons": [
        {
          "title": "string",
          "description": "string",
          "contentType": "ARTICLE|VIDEO|PDF|QUIZ|EMBED|CHECKPOINT",
          "contentBody": "string (summary of content)",
          "topics": ["string"],
          "dayStart": number | null,
          "dayEnd": number | null,
          "durationMins": number | null,
          "isRequired": true,
          "checkpointItems": ["string"] | null
        }
      ]
    }
  ]
}

Rules:
- Group lessons under phases (Foundation, Core, Specialization, Mastery etc)
- Use CHECKPOINT for assessment/evaluation sections
- Extract topics as keywords from each lesson
- durationMins is the estimated reading/learning time
- Keep descriptions concise (1-2 sentences)
- Phase colors: Foundation=#6366f1, Core=#f59e0b, Specialization=#10b981, Mastery=#ef4444
- If day ranges are mentioned, extract them

PDF Content:
${pdfText}`;

    const hasCredits = await deductAiCredits(orgId, 5);
    if (!hasCredits) { res.status(402).json({ error: 'Insufficient AI credits' }); return; }

    let aiResponse: string;
    try {
      aiResponse = await callClaude(prompt, undefined, 'thorough');
    } catch {
      res.status(500).json({ error: 'AI parsing failed. Try again.' }); return;
    }

    type PdfPhase = {
      title: string; phaseNumber: number; color?: string;
      dayStart?: number | null; dayEnd?: number | null;
      lessons: Array<{
        title: string; description?: string; contentType: string; contentBody?: string;
        topics?: string[]; dayStart?: number | null; dayEnd?: number | null;
        durationMins?: number | null; isRequired?: boolean; checkpointItems?: string[] | null;
      }>;
    };
    type PdfResult = {
      title: string; description: string; type: string;
      durationDays: number | null; phases: PdfPhase[];
    };

    let parsedPdf: PdfResult;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsedPdf = JSON.parse(jsonMatch[0]) as PdfResult;
    } catch {
      res.status(500).json({ error: 'AI response was not valid JSON', raw: aiResponse.slice(0, 500) }); return;
    }

    const module = await prisma.$transaction(async (tx) => {
      const mod = await tx.learningModule.create({
        data: {
          orgId,
          createdById: userId,
          title: parsedPdf.title,
          description: parsedPdf.description,
          type: (parsedPdf.type as Prisma.EnumLearningModuleTypeFilter['equals']) ?? 'OTHER',
          durationDays: parsedPdf.durationDays ?? null,
          departmentId,
          isPublished: false,
        },
      });

      for (let pi = 0; pi < parsedPdf.phases.length; pi++) {
        const phaseData = parsedPdf.phases[pi];
        const phase = await tx.learningPhase.create({
          data: {
            moduleId: mod.id,
            title: phaseData.title,
            phaseNumber: phaseData.phaseNumber ?? pi + 1,
            color: phaseData.color ?? null,
            dayStart: phaseData.dayStart ?? null,
            dayEnd: phaseData.dayEnd ?? null,
            order: pi,
          },
        });

        for (let li = 0; li < phaseData.lessons.length; li++) {
          const ld = phaseData.lessons[li];
          await tx.learningLesson.create({
            data: {
              moduleId: mod.id,
              phaseId: phase.id,
              title: ld.title,
              description: ld.description ?? null,
              contentType: (ld.contentType as Prisma.EnumLessonContentTypeFilter['equals']) ?? 'ARTICLE',
              contentBody: ld.contentBody ?? null,
              topics: ld.topics ?? Prisma.JsonNull,
              dayStart: ld.dayStart ?? null,
              dayEnd: ld.dayEnd ?? null,
              durationMins: ld.durationMins ?? null,
              isRequired: ld.isRequired ?? true,
              checkpointItems: ld.checkpointItems ?? Prisma.JsonNull,
              order: li,
            },
          });
        }
      }

      return mod;
    });

    invalidateLearningCache(orgId);
    res.status(201).json({ moduleId: module.id, title: module.title });
  }
);

// GET /learning/modules/:id
router.get('/modules/:id', async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({
    where: { id: moduleId, orgId },
    include: {
      department: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      phases: { orderBy: { order: 'asc' } },
      lessons: {
        orderBy: [{ order: 'asc' }],
        include: { quizzes: { orderBy: { order: 'asc' } } },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  if (!module.isPublished && !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
    res.status(403).json({ error: 'Module not published' }); return;
  }

  const enrollment = await prisma.learningEnrollment.findUnique({
    where: { moduleId_userId: { moduleId: module.id, userId } },
    include: { progress: true, certificate: true },
  });

  res.json({ ...module, myEnrollment: enrollment ?? null });
});

// PATCH /learning/modules/:id
router.patch(
  '/modules/:id',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  auditLog('LearningModule', 'UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, userId, role } = req.user!;
    const moduleId = req.params.id as string;

    const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
    if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (!canManageModule(role, user?.departmentId, module.departmentId)) {
      res.status(403).json({ error: 'Cannot edit modules outside your department' }); return;
    }

    const parsed = moduleSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const updated = await prisma.learningModule.update({
      where: { id: module.id },
      data: parsed.data,
    });

    invalidateLearningCache(orgId);
    res.json(updated);
  }
);

// DELETE /learning/modules/:id
router.delete(
  '/modules/:id',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  auditLog('LearningModule', 'DELETE'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, userId, role } = req.user!;
    const moduleId = req.params.id as string;

    const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
    if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (!canManageModule(role, user?.departmentId, module.departmentId)) {
      res.status(403).json({ error: 'Cannot delete modules outside your department' }); return;
    }

    await prisma.learningModule.update({ where: { id: module.id }, data: { isActive: false } });
    invalidateLearningCache(orgId);
    res.status(204).send();
  }
);

// POST /learning/modules/:id/publish
router.post(
  '/modules/:id/publish',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  auditLog('LearningModule', 'UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const { orgId, userId, role } = req.user!;
    const moduleId = req.params.id as string;

    const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
    if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (!canManageModule(role, user?.departmentId, module.departmentId)) {
      res.status(403).json({ error: 'Cannot publish modules outside your department' }); return;
    }

    const lessonCount = await prisma.learningLesson.count({ where: { moduleId: module.id } });
    if (lessonCount === 0) {
      res.status(400).json({ error: 'Add at least one lesson before publishing' }); return;
    }

    const updated = await prisma.learningModule.update({
      where: { id: module.id },
      data: { isPublished: !module.isPublished },
    });

    invalidateLearningCache(orgId);
    res.json(updated);
  }
);

// ─── Phases ───────────────────────────────────────────────────────────────────

router.post('/modules/:id/phases', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const parsed = phaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const phase = await prisma.learningPhase.create({ data: { moduleId: module.id, ...parsed.data } });
  res.status(201).json(phase);
});

router.patch('/modules/:id/phases/:phaseId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;
  const phaseId = req.params.phaseId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const parsed = phaseSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const result = await prisma.learningPhase.updateMany({ where: { id: phaseId, moduleId: module.id }, data: parsed.data });
  res.json(result);
});

router.delete('/modules/:id/phases/:phaseId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;
  const phaseId = req.params.phaseId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  await prisma.learningLesson.updateMany({ where: { phaseId, moduleId: module.id }, data: { phaseId: null } });
  await prisma.learningPhase.deleteMany({ where: { id: phaseId, moduleId: module.id } });
  res.status(204).send();
});

// ─── Lessons ──────────────────────────────────────────────────────────────────

router.post('/modules/:id/lessons', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const lesson = await prisma.learningLesson.create({
    data: {
      moduleId: module.id,
      title: d.title,
      description: d.description ?? null,
      phaseId: d.phaseId ?? null,
      contentType: d.contentType,
      contentUrl: d.contentUrl ?? null,
      contentBody: d.contentBody ?? null,
      notesUrl: d.notesUrl ?? null,
      topics: d.topics ?? Prisma.JsonNull,
      dayStart: d.dayStart ?? null,
      dayEnd: d.dayEnd ?? null,
      checkpointItems: d.checkpointItems ?? Prisma.JsonNull,
      durationMins: d.durationMins ?? null,
      order: d.order,
      isRequired: d.isRequired,
    },
  });

  res.status(201).json(lesson);
});

router.patch('/modules/:id/lessons/:lessonId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;
  const lessonId = req.params.lessonId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const parsed = lessonSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const d = parsed.data;
  const result = await prisma.learningLesson.updateMany({
    where: { id: lessonId, moduleId: module.id },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description ?? null }),
      ...(d.phaseId !== undefined && { phaseId: d.phaseId ?? null }),
      ...(d.contentType !== undefined && { contentType: d.contentType }),
      ...(d.contentUrl !== undefined && { contentUrl: d.contentUrl ?? null }),
      ...(d.contentBody !== undefined && { contentBody: d.contentBody ?? null }),
      ...(d.notesUrl !== undefined && { notesUrl: d.notesUrl ?? null }),
      ...(d.topics !== undefined && { topics: d.topics ?? Prisma.JsonNull }),
      ...(d.dayStart !== undefined && { dayStart: d.dayStart ?? null }),
      ...(d.dayEnd !== undefined && { dayEnd: d.dayEnd ?? null }),
      ...(d.checkpointItems !== undefined && { checkpointItems: d.checkpointItems ?? Prisma.JsonNull }),
      ...(d.durationMins !== undefined && { durationMins: d.durationMins ?? null }),
      ...(d.order !== undefined && { order: d.order }),
      ...(d.isRequired !== undefined && { isRequired: d.isRequired }),
    },
  });

  res.json(result);
});

router.delete('/modules/:id/lessons/:lessonId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;
  const moduleId = req.params.id as string;
  const lessonId = req.params.lessonId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (!canManageModule(role, user?.departmentId, module.departmentId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  await prisma.learningLesson.deleteMany({ where: { id: lessonId, moduleId: module.id } });
  res.status(204).send();
});

// ─── Quizzes ──────────────────────────────────────────────────────────────────

router.post('/modules/:id/lessons/:lessonId/quizzes', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.id as string;
  const lessonId = req.params.lessonId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const quiz = await prisma.learningQuiz.create({ data: { lessonId, ...parsed.data } });
  res.status(201).json(quiz);
});

router.patch('/modules/:id/lessons/:lessonId/quizzes/:quizId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.id as string;
  const lessonId = req.params.lessonId as string;
  const quizId = req.params.quizId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const parsed = quizSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const result = await prisma.learningQuiz.updateMany({ where: { id: quizId, lessonId }, data: parsed.data });
  res.json(result);
});

router.delete('/modules/:id/lessons/:lessonId/quizzes/:quizId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.id as string;
  const lessonId = req.params.lessonId as string;
  const quizId = req.params.quizId as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  await prisma.learningQuiz.deleteMany({ where: { id: quizId, lessonId } });
  res.status(204).send();
});

// ─── Enrollments ──────────────────────────────────────────────────────────────

router.post('/modules/:id/enroll', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId, isPublished: true } });
  if (!module) { res.status(404).json({ error: 'Module not found or not published' }); return; }

  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { userIds, dueDate } = parsed.data;
  const existing = await prisma.learningEnrollment.findMany({
    where: { moduleId: module.id, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));
  const newUserIds = userIds.filter((id) => !existingIds.has(id));

  if (newUserIds.length > 0) {
    await prisma.learningEnrollment.createMany({
      data: newUserIds.map((userId) => ({
        orgId,
        moduleId: module.id,
        userId,
        dueDate: dueDate ? new Date(dueDate) : null,
      })),
    });
  }

  res.json({ enrolled: newUserIds.length, skipped: existingIds.size });
});

router.post('/modules/:id/self-enroll', async (req: AuthRequest, res: Response) => {
  const { orgId, userId } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId, isPublished: true } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const existing = await prisma.learningEnrollment.findUnique({
    where: { moduleId_userId: { moduleId: module.id, userId } },
  });

  if (existing) { res.json(existing); return; }

  const enrollment = await prisma.learningEnrollment.create({
    data: { orgId, moduleId: module.id, userId },
  });

  res.status(201).json(enrollment);
});

router.get('/modules/:id/enrollments', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.id as string;

  const module = await prisma.learningModule.findFirst({ where: { id: moduleId, orgId } });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const enrollments = await prisma.learningEnrollment.findMany({
    where: { moduleId: module.id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      _count: { select: { progress: { where: { status: 'COMPLETED' } } } },
    },
    orderBy: { enrolledAt: 'desc' },
  });

  const lessonCount = await prisma.learningLesson.count({ where: { moduleId: module.id, isRequired: true } });
  res.json(enrollments.map((e) => ({ ...e, lessonCount })));
});

// ─── Learner Progress ─────────────────────────────────────────────────────────

router.get('/my-modules', async (req: AuthRequest, res: Response) => {
  const { userId, orgId } = req.user!;

  const enrollments = await prisma.learningEnrollment.findMany({
    where: { userId, orgId },
    include: {
      module: {
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { lessons: true } },
        },
      },
      // Heartbeats create IN_PROGRESS rows as soon as a lesson is opened, so
      // only COMPLETED rows count toward the learner's progress numbers.
      _count: { select: { progress: { where: { status: 'COMPLETED' } } } },
    },
    orderBy: { enrolledAt: 'desc' },
  });

  res.json(enrollments);
});

router.get('/my-modules/:id/progress', async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const moduleId = req.params.id as string;

  const enrollment = await prisma.learningEnrollment.findUnique({
    where: { moduleId_userId: { moduleId, userId } },
    include: {
      module: {
        include: {
          phases: { orderBy: { order: 'asc' } },
          lessons: {
            orderBy: [{ order: 'asc' }],
            include: { quizzes: { orderBy: { order: 'asc' } } },
          },
        },
      },
      progress: true,
      certificate: true,
    },
  });

  if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }
  res.json(enrollment);
});

// POST /learning/progress/:lessonId/heartbeat — watch-time tracking.
// The client beats every ~15s while the lesson is open and the tab is visible;
// seconds are incremented server-side (never replaced) so completion updates
// can't clobber accumulated watch time. Capped per beat to limit abuse.
router.post('/progress/:lessonId/heartbeat', async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const lessonId = req.params.lessonId as string;

  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { enrollmentId, videoPosition } = parsed.data;
  const seconds = Math.min(parsed.data.seconds, 60);

  const enrollment = await prisma.learningEnrollment.findFirst({ where: { id: enrollmentId, userId } });
  if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

  const lesson = await prisma.learningLesson.findFirst({
    where: { id: lessonId, moduleId: enrollment.moduleId },
    select: { id: true },
  });
  if (!lesson) { res.status(404).json({ error: 'Lesson not found in this module' }); return; }

  const now = new Date();
  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: {
      enrollmentId,
      lessonId,
      userId,
      status: 'IN_PROGRESS',
      startedAt: now,
      lastActivityAt: now,
      timeSpentSec: seconds,
      videoPosition: videoPosition ?? null,
    },
    update: {
      timeSpentSec: { increment: seconds },
      lastActivityAt: now,
      ...(videoPosition !== undefined && { videoPosition }),
    },
  });

  if (enrollment.status === 'ENROLLED') {
    await prisma.learningEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'IN_PROGRESS', startedAt: now },
    });
  }

  res.json({ timeSpentSec: progress.timeSpentSec });
});

// GET /learning/my-stats — learner dashboard stats (watch time, streak, completions)
router.get('/my-stats', async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;

  const [progress, moduleAgg, certificateCount] = await Promise.all([
    prisma.lessonProgress.findMany({
      where: { userId },
      select: { timeSpentSec: true, status: true, startedAt: true, completedAt: true, lastActivityAt: true },
    }),
    prisma.learningEnrollment.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    prisma.learningCertificate.count({ where: { userId } }),
  ]);

  const totalWatchSec = progress.reduce((sum, p) => sum + p.timeSpentSec, 0);
  const lessonsCompleted = progress.filter((p) => p.status === 'COMPLETED').length;
  const modulesCompleted = moduleAgg.find((g) => g.status === 'COMPLETED')?._count.status ?? 0;
  const modulesInProgress = moduleAgg.find((g) => g.status === 'IN_PROGRESS')?._count.status ?? 0;

  // Streak: consecutive days (IST) with any learning activity, counting back
  // from today — today itself is not required so an unopened morning doesn't
  // show a broken streak.
  const activeDays = new Set<string>();
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  for (const p of progress) {
    for (const d of [p.startedAt, p.completedAt, p.lastActivityAt]) {
      if (d) activeDays.add(dayKey(d));
    }
  }
  let streakDays = 0;
  const cursor = new Date();
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  res.json({ totalWatchSec, lessonsCompleted, modulesCompleted, modulesInProgress, certificateCount, streakDays });
});

router.patch('/progress/:lessonId', async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const lessonId = req.params.lessonId as string;

  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const enrollmentId = req.body.enrollmentId as string;
  if (!enrollmentId) { res.status(400).json({ error: 'enrollmentId required' }); return; }

  const enrollment = await prisma.learningEnrollment.findFirst({ where: { id: enrollmentId, userId } });
  if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

  const data = parsed.data;
  // timeSpentSec is owned by the heartbeat endpoint (incremental); on update it
  // must never be replaced or a completion event would erase accumulated watch time.
  const { timeSpentSec, ...rest } = data;

  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: {
      enrollmentId,
      lessonId,
      userId,
      ...data,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      completedAt: data.status === 'COMPLETED' ? new Date() : null,
    },
    update: {
      ...rest,
      lastActivityAt: new Date(),
      completedAt: data.status === 'COMPLETED' ? new Date() : undefined,
    },
  });

  if (enrollment.status === 'ENROLLED') {
    await prisma.learningEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  if (data.status === 'COMPLETED') {
    const module = await prisma.learningModule.findUnique({
      where: { id: enrollment.moduleId },
      select: { passScore: true },
    });

    const [lessonCount, completedCount] = await Promise.all([
      prisma.learningLesson.count({ where: { moduleId: enrollment.moduleId, isRequired: true } }),
      prisma.lessonProgress.count({ where: { enrollmentId, status: 'COMPLETED' } }),
    ]);

    if (lessonCount > 0 && completedCount >= lessonCount) {
      // Only completed lessons count toward the final score — heartbeats create
      // IN_PROGRESS rows for merely-opened lessons, which must not add default 100s.
      const allProgress = await prisma.lessonProgress.findMany({
        where: { enrollmentId, status: 'COMPLETED' },
        select: { quizScore: true },
      });
      const scores = allProgress.map((p) => p.quizScore ?? 100);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;
      const passed = avgScore >= (module?.passScore ?? 70);

      await prisma.learningEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date(), score: avgScore, passed },
      });

      if (passed) {
        await prisma.learningCertificate.upsert({
          where: { enrollmentId },
          create: { enrollmentId, userId, moduleId: enrollment.moduleId },
          update: {},
        });
      }
    }
  }

  res.json(progress);
});

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get('/analytics', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId, userId, role } = req.user!;

  let deptFilter: string | undefined;
  if (role === 'DEPARTMENT_HEAD') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    deptFilter = user?.departmentId ?? undefined;
  }

  const moduleWhere: Prisma.LearningModuleWhereInput = {
    orgId,
    ...(deptFilter ? { departmentId: deptFilter } : {}),
  };

  const enrollWhere: Prisma.LearningEnrollmentWhereInput = {
    orgId,
    ...(deptFilter ? { module: { departmentId: deptFilter } } : {}),
  };

  const [moduleCount, enrollmentCount, completionCount, certificateCount] = await Promise.all([
    prisma.learningModule.count({ where: moduleWhere }),
    prisma.learningEnrollment.count({ where: enrollWhere }),
    prisma.learningEnrollment.count({ where: { ...enrollWhere, status: 'COMPLETED' } }),
    prisma.learningCertificate.count({
      where: deptFilter ? { module: { departmentId: deptFilter } } : {},
    }),
  ]);

  const topModules = await prisma.learningModule.findMany({
    where: moduleWhere,
    include: { _count: { select: { enrollments: true } } },
    orderBy: { enrollments: { _count: 'desc' } },
    take: 5,
  });

  res.json({
    moduleCount,
    enrollmentCount,
    completionCount,
    completionRate: enrollmentCount > 0 ? Math.round((completionCount / enrollmentCount) * 100) : 0,
    certificateCount,
    topModules,
  });
});

router.get('/analytics/:moduleId', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const { orgId } = req.user!;
  const moduleId = req.params.moduleId as string;

  const module = await prisma.learningModule.findFirst({
    where: { id: moduleId, orgId },
    include: { _count: { select: { lessons: true } } },
  });
  if (!module) { res.status(404).json({ error: 'Module not found' }); return; }

  const enrollments = await prisma.learningEnrollment.findMany({
    where: { moduleId: module.id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, departmentId: true } },
      _count: { select: { progress: true } },
    },
  });

  const statusCounts = enrollments.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lessonProgress = await prisma.lessonProgress.groupBy({
    by: ['lessonId'],
    where: { enrollment: { moduleId: module.id } },
    _count: { lessonId: true },
  });

  res.json({ module, enrollments, statusCounts, lessonProgress });
});

export default router;
