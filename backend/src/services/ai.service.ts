import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { createHash } from 'crypto';
import { fanOutNotification } from './notification.service';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// M9.7 — model routing: use Sonnet for high-complexity, Haiku for everything else
export type AiComplexity = 'fast' | 'balanced' | 'thorough';
const MODEL_MAP: Record<AiComplexity, string> = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-haiku-4-5-20251001',
  thorough: 'claude-sonnet-4-6',
};

// M9.2 — prompt registry (versioned prompts)
export const PROMPTS = {
  STANDUP_DIGEST: {
    version: 'v1',
    system: (deptName: string) =>
      `You are an AI assistant for ${deptName} team. Extract key themes: accomplishments, commitments, and blockers.`,
    user: (cards: string) => `Summarise this standup in 3 bullet points. Be concise.\n\n${cards}`,
  },
  GOAL_SUGGESTIONS: {
    version: 'v1',
    system: 'You are an OKR expert for Indian SMBs. Return only valid JSON.',
    user: (description: string) =>
      `Based on this business goal: "${description}"\n\nSuggest 3-5 KRAs (Key Result Areas) in JSON format: {"kras": ["KRA 1", "KRA 2"]}`,
  },
  WEEKLY_DIGEST: {
    version: 'v1',
    system: 'You are a business performance coach for Indian SMBs. Be direct and actionable.',
    user: (done: number, blocked: number, standups: number) =>
      `Write a crisp weekly executive digest for an Indian SMB:\n- Tasks completed this week: ${done}\n- Tasks currently blocked: ${blocked}\n- Standups held: ${standups}\n\nHighlight wins, flag concerns, give 2 recommendations. Max 150 words.`,
  },
  TASK_SUGGESTIONS: {
    version: 'v1',
    system: 'You are a project management assistant for Indian SMBs. Be concise and actionable.',
    user: (title: string, blockerType: string, description: string) =>
      `A task "${title}" is blocked due to "${blockerType}". Context: ${description || 'none'}.\n\nSuggest 3 specific next steps to unblock it. Return JSON: {"suggestions": ["step 1", "step 2", "step 3"]}`,
  },
  STATUS_CHANGE_SUGGESTIONS: {
    version: 'v1',
    system: 'You are a project management assistant for Indian SMBs. Be concise and actionable.',
    user: (title: string, status: string, context: string) => {
      let focus = '';
      if (status === 'BLOCKED') {
        focus = `is blocked. Suggest 3 specific next steps to unblock it.`;
      } else if (status === 'DONE') {
        focus = `is completed. Suggest 3 verification steps, follow-ups, or learnings.`;
      } else if (status === 'IN_PROGRESS') {
        focus = `is now in progress. Suggest 3 best practices or ways to execute it efficiently and stay on track.`;
      } else if (status === 'IN_REVIEW') {
        focus = `is pending review. Suggest 3 checklist items for the reviewer to verify.`;
      } else {
        focus = `is set to ${status}. Suggest 3 next steps to plan or proceed.`;
      }
      return `A task "${title}" has changed status to "${status}". Context/Blocker: ${context || 'none'}.\n\n${focus} Return JSON: {"suggestions": ["step 1", "step 2", "step 3"]}`;
    }
  },
  LEARNING_RECOMMEND: {
    version: 'v1',
    system: 'You are a learning coach for Indian SMBs. Recommend targeted skill-building based on the employee\'s role and learning gaps.',
    user: (role: string, completed: string[], pending: string[]) =>
      `Employee role: ${role}\nCompleted learning: ${completed.join(', ') || 'none'}\nPending/not started: ${pending.join(', ') || 'none'}\n\nSuggest up to 5 prioritized items from the pending list to tackle next, with a brief reason. Return JSON: {"recommendations": [{"title": "...", "reason": "...", "priority": "high|medium|low"}]}`,
  },
} as const;

interface ClaudeMessage { role: 'user' | 'assistant'; content: string }

// M9.6 — cache Claude responses in Redis (TTL varies by use case)
async function getCachedResponse(cacheKey: string): Promise<string | null> {
  try { return await redis.get(`ai:${cacheKey}`); } catch { return null; }
}
async function setCachedResponse(cacheKey: string, value: string, ttlSeconds = 3600): Promise<void> {
  try { await redis.setex(`ai:${cacheKey}`, ttlSeconds, value); } catch { /* non-fatal */ }
}

export async function callClaude(
  prompt: string,
  systemPrompt?: string,
  complexity: AiComplexity = 'fast',
  cacheTtl = 0  // 0 = no cache
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  // M9.6: check cache first
  if (cacheTtl > 0) {
    const hash = createHash('sha256').update(`${systemPrompt ?? ''}::${prompt}`).digest('hex').slice(0, 16);
    const cached = await getCachedResponse(hash);
    if (cached) return cached;

    const result = await callClaudeRaw(prompt, systemPrompt, complexity);
    await setCachedResponse(hash, result, cacheTtl);
    return result;
  }

  return callClaudeRaw(prompt, systemPrompt, complexity);
}

async function callClaudeRaw(prompt: string, systemPrompt?: string, complexity: AiComplexity = 'fast'): Promise<string> {
  const model = MODEL_MAP[complexity];
  const body: Record<string, unknown> = {
    model,
    max_tokens: complexity === 'thorough' ? 2048 : 1024,
    messages: [{ role: 'user', content: prompt } as ClaudeMessage],
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? '';
}

export async function deductAiCredits(orgId: string, amount = 1): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { aiCreditsTotal: true, aiCreditsUsed: true },
  });
  if (!org || org.aiCreditsUsed + amount > org.aiCreditsTotal) return false;

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { aiCreditsUsed: { increment: amount } },
    select: { aiCreditsUsed: true, aiCreditsTotal: true },
  });

  // M9.5 — usage alert: notify owners when ≥80% credits consumed
  const usageRatio = updated.aiCreditsUsed / updated.aiCreditsTotal;
  if (usageRatio >= 0.8 && usageRatio - (amount / updated.aiCreditsTotal) < 0.8) {
    const owners = await prisma.user.findMany({
      where: { orgId, role: { in: ['OWNER', 'COMPANY_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (owners.length > 0) {
      fanOutNotification(orgId, owners.map((u) => u.id), 'KRA_STATUS_CHANGED', {
        message: `AI credits at ${Math.round(usageRatio * 100)}% — ${updated.aiCreditsTotal - updated.aiCreditsUsed} remaining`,
      }).catch(() => {});
    }
  }

  return true;
}

export async function generateStandupDigest(standupId: string): Promise<string> {
  const standup = await prisma.standup.findUnique({
    where: { id: standupId },
    include: {
      department: { select: { name: true, orgId: true } },
      cards: {
        include: { user: { select: { name: true } } },
        where: { status: 'SUBMITTED' },
      },
    },
  });
  if (!standup) return '';

  const hasCredits = await deductAiCredits(standup.department.orgId, 2);
  if (!hasCredits) return 'Insufficient AI credits';

  const p = PROMPTS.STANDUP_DIGEST;
  const cardSummaries = standup.cards.map((c) =>
    `${c.user.name}: Yesterday: ${c.yesterdaySummary || '—'} | Today: ${c.todayCommitments || '—'} | Blockers: ${c.blockers || 'None'}`
  ).join('\n');

  return callClaude(p.user(cardSummaries), p.system(standup.department.name), 'fast', 1800);
}

export async function generateGoalSuggestions(description: string, orgId: string): Promise<string[]> {
  const hasCredits = await deductAiCredits(orgId, 1);
  if (!hasCredits) return [];

  const p = PROMPTS.GOAL_SUGGESTIONS;
  const text = await callClaude(p.user(description), p.system, 'fast', 3600);

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { kras?: string[] };
    return parsed.kras ?? [];
  } catch {
    return [];
  }
}

export async function generateWeeklyDigest(orgId: string): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [doneTasks, blockedTasks, standups] = await Promise.all([
    prisma.task.count({ where: { orgId, status: 'DONE', completedAt: { gte: weekAgo } } }),
    prisma.task.count({ where: { orgId, status: 'BLOCKED' } }),
    prisma.standup.count({ where: { orgId, status: 'COMPLETED', scheduledAt: { gte: weekAgo } } }),
  ]);

  const hasCredits = await deductAiCredits(orgId, 3);
  if (!hasCredits) return 'Insufficient AI credits';

  const p = PROMPTS.WEEKLY_DIGEST;
  return callClaude(p.user(doneTasks, blockedTasks, standups), p.system, 'balanced', 43200);
}

// M7.5 — AI learning recommender
export async function generateLearningRecommendations(
  userId: string,
  orgId: string
): Promise<Array<{ title: string; reason: string; priority: string }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return [];

  const assignments = await prisma.learningAssignment.findMany({
    where: { userId },
    include: { learningItem: { select: { title: true } } },
  });

  const completed = assignments
    .filter((a) => a.status === 'COMPLETED')
    .map((a) => a.learningItem.title);
  const pending = assignments
    .filter((a) => a.status !== 'COMPLETED')
    .map((a) => a.learningItem.title);

  if (pending.length === 0) return [];

  const hasCredits = await deductAiCredits(orgId, 1);
  if (!hasCredits) return [];

  const p = PROMPTS.LEARNING_RECOMMEND;
  const text = await callClaude(
    p.user(user.role, completed, pending),
    p.system,
    'fast',
    1800
  );

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      recommendations?: Array<{ title: string; reason: string; priority: string }>;
    };
    return parsed.recommendations ?? [];
  } catch {
    return [];
  }
}

// M4.7 — AI next-step suggestions for blocked tasks
export async function generateTaskSuggestions(
  taskId: string,
  orgId: string
): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, blockerType: true, description: true },
  });
  if (!task) return [];

  const hasCredits = await deductAiCredits(orgId, 1);
  if (!hasCredits) return [];

  const p = PROMPTS.TASK_SUGGESTIONS;
  const text = await callClaude(
    p.user(task.title, task.blockerType ?? 'unknown', task.description ?? ''),
    p.system,
    'fast',
    1800
  );

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { suggestions?: string[] };
    return parsed.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function generateStatusChangeSuggestions(
  taskId: string,
  status: string,
  orgId: string,
  blockerDetails?: string
): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, description: true },
  });
  if (!task) return [];

  const fallbackSuggestions: Record<string, string[]> = {
    BLOCKED: [
      'Identify the root dependency or approval bottleneck and address it directly.',
      'Set up a quick 5-minute sync with the blocker owner to align on next steps.',
      'Escalate to the department head if the blocker resolution is delayed.'
    ],
    IN_PROGRESS: [
      'Break down this task into smaller milestones or actionable sub-tasks.',
      'Block dedicated focus time in your calendar to execute without distractions.',
      'Share early drafts or progress with team members to get quick feedback.'
    ],
    DONE: [
      'Double check the completed work against the initial task requirements.',
      'Request feedback or approval from the task assigner or team manager.',
      'Document any key learnings or useful documentation from this work.'
    ],
    IN_REVIEW: [
      'Send a direct message or link to the reviewer to prompt their review.',
      'Prepare a quick walkthrough or summary of the completed deliverables.',
      'Be ready to iterate on the task if feedback or changes are requested.'
    ],
    TODO: [
      'Identify any prerequisite information or resources needed to start.',
      'Estimate the time needed for completion and set a personal target.',
      'Confirm the expected outcome with the task creator before beginning.'
    ],
  };

  const statusKey = status as keyof typeof fallbackSuggestions;
  const fallbacks = fallbackSuggestions[statusKey] || [
    'Define the next immediate action item to get started on this task.',
    'Align with relevant stakeholders on the priority and expected timeline.',
    'Check if any resources are missing that might delay progression.'
  ];

  try {
    const hasCredits = await deductAiCredits(orgId, 1);
    if (!hasCredits) return fallbacks;

    const context = blockerDetails || task.description || '';
    const p = PROMPTS.STATUS_CHANGE_SUGGESTIONS;
    const text = await callClaude(
      p.user(task.title, status, context),
      p.system,
      'fast',
      1800
    );

    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { suggestions?: string[] };
    return parsed.suggestions && parsed.suggestions.length > 0 ? parsed.suggestions : fallbacks;
  } catch (error) {
    console.error('Error generating status suggestions via AI, using fallback:', error);
    return fallbacks;
  }
}
