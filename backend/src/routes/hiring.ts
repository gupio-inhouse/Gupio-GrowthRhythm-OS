import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { callClaude, deductAiCredits } from '../services/ai.service';

const router = Router();
router.use(authenticate);

// ─── Job Descriptions ────────────────────────────────────────────────────────

const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  requirements: z.string().optional(),
  niceToHave: z.string().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  location: z.string().optional(),
  isRemote: z.boolean().optional(),
  departmentId: z.string().optional(),
});

// GET /hiring/jobs
router.get('/jobs', async (req: AuthRequest, res: Response) => {
  const { stage, departmentId } = req.query;

  const jobs = await prisma.jobDescription.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(stage ? { stage: stage as import('@prisma/client').HiringStage } : {}),
      ...(departmentId ? { departmentId: departmentId as string } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { candidates: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(jobs);
});

// POST /hiring/jobs
router.post(
  '/jobs',
  requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'),
  async (req: AuthRequest, res: Response) => {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const job = await prisma.jobDescription.create({
      data: {
        ...parsed.data,
        orgId: req.user!.orgId,
        createdBy: req.user!.userId,
      },
      include: { department: { select: { id: true, name: true } } },
    });

    auditLog('job_description', 'CREATE');
    res.status(201).json(job);
  }
);

// GET /hiring/jobs/:id
router.get('/jobs/:id', async (req: AuthRequest, res: Response) => {
  const job = await prisma.jobDescription.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: {
      department: { select: { id: true, name: true } },
      candidates: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, stage: true, status: true,
          consentGiven: true, createdAt: true,
        },
      },
    },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(job);
});

// PATCH /hiring/jobs/:id
router.patch('/jobs/:id', async (req: AuthRequest, res: Response) => {
  const updateSchema = createJobSchema.partial().extend({
    stage: z.enum(['OPEN', 'SOURCING', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED', 'ON_HOLD']).optional(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const job = await prisma.jobDescription.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: parsed.data,
    include: { department: { select: { id: true, name: true } } },
  });

  auditLog('job_description', 'UPDATE');
  res.json(job);
});

// POST /hiring/jobs/:id/ai-jd
router.post('/jobs/:id/ai-jd', async (req: AuthRequest, res: Response) => {
  const job = await prisma.jobDescription.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, title: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const hasCredits = await deductAiCredits(req.user!.orgId, 3);
  if (!hasCredits) {
    res.status(402).json({ error: 'Insufficient AI credits' });
    return;
  }

  const { context } = req.body as { context?: string };
  const prompt = `You are an expert HR professional. Generate a structured job description for the role: "${job.title}".
${context ? `Additional context: ${context}` : ''}

Return ONLY valid JSON with this exact structure:
{
  "description": "A 2-3 paragraph overview of the role and company fit",
  "requirements": "Required Qualifications:\n• Qualification 1\n• Qualification 2\n• Qualification 3\n• Qualification 4",
  "niceToHave": "Nice to Have:\n• Skill 1\n• Skill 2\n• Skill 3",
  "responsibilities": "Key Responsibilities:\n• Responsibility 1\n• Responsibility 2\n• Responsibility 3\n• Responsibility 4\n• Responsibility 5"
}`;

  const raw = await callClaude(
    prompt,
    'You are an expert HR writer. Return only valid JSON, no markdown fences.'
  );

  let parsed: { description?: string; requirements?: string; niceToHave?: string; responsibilities?: string };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as typeof parsed;
  } catch {
    res.status(500).json({ error: 'AI response parsing failed', raw });
    return;
  }

  const description = [parsed.description, parsed.responsibilities].filter(Boolean).join('\n\n');

  res.json({
    description: description || parsed.description || '',
    requirements: parsed.requirements || '',
    niceToHave: parsed.niceToHave || '',
  });
});

// ─── Candidates ───────────────────────────────────────────────────────────────

const createCandidateSchema = z.object({
  jobId: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  resumeUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  consentGiven: z.literal(true, { errorMap: () => ({ message: 'Candidate consent is required' }) }),
});

// GET /hiring/candidates
router.get('/candidates', async (req: AuthRequest, res: Response) => {
  const { jobId, stage } = req.query;

  const candidates = await prisma.candidate.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(jobId ? { jobId: jobId as string } : {}),
      ...(stage ? { stage: stage as import('@prisma/client').HiringStage } : {}),
    },
    include: {
      job: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(candidates);
});

// POST /hiring/candidates
router.post('/candidates', async (req: AuthRequest, res: Response) => {
  const parsed = createCandidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const candidate = await prisma.candidate.create({
    data: {
      ...parsed.data,
      orgId: req.user!.orgId,
      createdBy: req.user!.userId,
      consentGivenAt: new Date(),
    },
    include: { job: { select: { id: true, title: true } } },
  });

  auditLog('candidate', 'CREATE');
  res.status(201).json(candidate);
});

// GET /hiring/candidates/:id
router.get('/candidates/:id', async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    include: {
      job: { select: { id: true, title: true } },
      scorecards: {
        include: {
          interviewer: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { conductedAt: 'desc' },
      },
    },
  });

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  res.json(candidate);
});

// PATCH /hiring/candidates/:id
router.patch('/candidates/:id', async (req: AuthRequest, res: Response) => {
  const updateSchema = z.object({
    stage: z.enum(['OPEN', 'SOURCING', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED', 'ON_HOLD']).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'HIRED', 'REJECTED']).optional(),
    notes: z.string().optional(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const candidate = await prisma.candidate.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: parsed.data,
    include: { job: { select: { id: true, title: true } } },
  });

  auditLog('candidate', 'UPDATE');
  res.json(candidate);
});

// ─── Interview Scorecards ─────────────────────────────────────────────────────

const createScorecardSchema = z.object({
  round: z.string().min(1),
  scores: z.record(z.unknown()),
  overallRating: z.number().int().min(1).max(10).optional(),
  recommendation: z.string().optional(),
  notes: z.string().optional(),
});

// POST /hiring/candidates/:id/scorecards
router.post('/candidates/:id/scorecards', async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  const parsed = createScorecardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const scorecard = await prisma.interviewScorecard.create({
    data: {
      ...parsed.data,
      scores: parsed.data.scores as import('@prisma/client').Prisma.InputJsonValue,
      candidateId: req.params.id as string,
      interviewerId: req.user!.userId,
    },
    include: {
      interviewer: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  auditLog('scorecard', 'CREATE');
  res.status(201).json(scorecard);
});

// GET /hiring/candidates/:id/scorecards
router.get('/candidates/:id/scorecards', async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  const scorecards = await prisma.interviewScorecard.findMany({
    where: { candidateId: req.params.id as string },
    include: {
      interviewer: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { conductedAt: 'desc' },
  });

  res.json(scorecards);
});

// ─── Onboarding Checklists ────────────────────────────────────────────────────

const checklistItemSchema = z.object({
  text: z.string().min(1),
  done: z.boolean().default(false),
});

const createChecklistSchema = z.object({
  userId: z.string(),
  title: z.string().min(1),
  items: z.array(checklistItemSchema),
});

// GET /hiring/onboarding
router.get('/onboarding', async (req: AuthRequest, res: Response) => {
  const checklists = await prisma.onboardingChecklist.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(checklists);
});

// POST /hiring/onboarding
router.post('/onboarding', async (req: AuthRequest, res: Response) => {
  const parsed = createChecklistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const checklist = await prisma.onboardingChecklist.create({
    data: {
      orgId: req.user!.orgId,
      userId: parsed.data.userId,
      title: parsed.data.title,
      items: parsed.data.items,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  auditLog('onboarding_checklist', 'CREATE');
  res.status(201).json(checklist);
});

// POST /hiring/jobs/:id/ai-onboarding
router.post('/jobs/:id/ai-onboarding', async (req: AuthRequest, res: Response) => {
  const job = await prisma.jobDescription.findUnique({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, title: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const hasCredits = await deductAiCredits(req.user!.orgId, 2);
  if (!hasCredits) {
    res.status(402).json({ error: 'Insufficient AI credits' });
    return;
  }

  const prompt = `Generate a comprehensive onboarding checklist for a new hire joining as "${job.title}".

Return ONLY valid JSON with this structure:
{
  "items": [
    { "text": "Checklist item description", "done": false },
    ...
  ]
}

Include 10-15 items covering: pre-joining paperwork, day 1 orientation, tool access, team introductions, role-specific training, 30-day goals, and first project onboarding.`;

  const raw = await callClaude(
    prompt,
    'You are an expert HR onboarding specialist. Return only valid JSON, no markdown fences.'
  );

  let items: Array<{ text: string; done: boolean }>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as { items?: Array<{ text: string; done: boolean }> };
    items = parsed.items ?? [];
  } catch {
    res.status(500).json({ error: 'AI response parsing failed', raw });
    return;
  }

  res.json({ items });
});

// PATCH /hiring/onboarding/:id
router.patch('/onboarding/:id', async (req: AuthRequest, res: Response) => {
  const updateSchema = z.object({
    items: z.array(checklistItemSchema).optional(),
    completedAt: z.string().datetime().nullable().optional(),
    title: z.string().min(1).optional(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { completedAt, ...rest } = parsed.data;
  const checklist = await prisma.onboardingChecklist.update({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    data: {
      ...rest,
      ...(completedAt !== undefined ? { completedAt: completedAt ? new Date(completedAt) : null } : {}),
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  auditLog('onboarding_checklist', 'UPDATE');
  res.json(checklist);
});

// DELETE /hiring/jobs/:id
router.delete('/jobs/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const job = await prisma.jobDescription.findFirst({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true, _count: { select: { candidates: true } } },
  });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job._count.candidates > 0) {
    res.status(400).json({ error: `Cannot delete: ${job._count.candidates} candidate(s) linked to this job.` });
    return;
  }
  await prisma.jobDescription.delete({ where: { id: req.params.id as string } });
  res.json({ success: true });
});

// DELETE /hiring/candidates/:id
router.delete('/candidates/:id', requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findFirst({
    where: { id: req.params.id as string, orgId: req.user!.orgId },
    select: { id: true },
  });
  if (!candidate) { res.status(404).json({ error: 'Candidate not found' }); return; }
  await prisma.candidate.delete({ where: { id: req.params.id as string } });
  res.json({ success: true });
});

export default router;
