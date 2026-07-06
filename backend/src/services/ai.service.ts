import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { createHash } from 'crypto';
import { fanOutNotification } from './notification.service';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

// ── Provider clients ──────────────────────────────────────────────────────────

const GROQ_MODEL   = 'llama-3.1-8b-instant';  // free, very fast
const GEMINI_MODEL = 'gemini-2.5-flash';       // fallback

function groqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new Groq({ apiKey: key });
}

function geminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenAI({});
}

// ── Core: Groq → Gemini fallback ─────────────────────────────────────────────

async function callAIRaw(prompt: string, systemPrompt?: string): Promise<string> {
  const groq = groqClient();
  if (groq) {
    try {
      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ],
        max_tokens: 1024,
      });
      const text = res.choices[0]?.message?.content ?? '';
      if (text) return text;
    } catch (err) {
      console.warn('[AI] Groq failed, falling back to Gemini:', (err as Error).message);
    }
  }

  // Fallback: Gemini
  const gemini = geminiClient();
  if (!gemini) throw new Error('No AI provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.');
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const response = await gemini.models.generateContent({ model: GEMINI_MODEL, contents: fullPrompt });
  return response.text ?? '';
}

// M9.6 — cache AI responses in Redis
async function getCachedResponse(cacheKey: string): Promise<string | null> {
  try { return await redis.get(`ai:${cacheKey}`); } catch { return null; }
}
async function setCachedResponse(cacheKey: string, value: string, ttlSeconds = 3600): Promise<void> {
  try { await redis.setex(`ai:${cacheKey}`, ttlSeconds, value); } catch { /* non-fatal */ }
}

async function callAI(prompt: string, systemPrompt?: string, cacheTtl = 0): Promise<string> {
  if (cacheTtl > 0) {
    const hash = createHash('sha256').update(`${systemPrompt ?? ''}::${prompt}`).digest('hex').slice(0, 16);
    const cached = await getCachedResponse(hash);
    if (cached) return cached;
    const result = await callAIRaw(prompt, systemPrompt);
    await setCachedResponse(hash, result, cacheTtl);
    return result;
  }
  return callAIRaw(prompt, systemPrompt);
}

// kept for backward compatibility with any direct callers
export async function callClaude(
  prompt: string,
  systemPrompt?: string,
  _complexity = 'fast',
  cacheTtl = 0
): Promise<string> {
  return callAI(prompt, systemPrompt, cacheTtl);
}

// Models sometimes ignore the "array of strings" instruction and return each
// suggestion as an object (e.g. {"step 1": "..."}) instead of a plain string.
// Flatten whatever shape comes back into plain, renderable strings.
function normalizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return Object.values(item).map(String).join(' ').trim();
      return item == null ? '' : String(item);
    })
    .filter(Boolean);
}

// ── Prompt registry ───────────────────────────────────────────────────────────

export const PROMPTS = {
  STANDUP_DIGEST: {
    version: 'v1',
    system: (deptName: string) =>
      `You are an AI assistant for ${deptName} team. Extract key themes: accomplishments, commitments, and blockers.`,
    user: (cards: string) => `Summarise this standup in 3 bullet points. Be concise.\n\n${cards}`,
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
      if (status === 'BLOCKED')     focus = `is blocked. Suggest 3 specific next steps to unblock it.`;
      else if (status === 'DONE')   focus = `is completed. Suggest 3 verification steps, follow-ups, or learnings.`;
      else if (status === 'IN_PROGRESS') focus = `is now in progress. Suggest 3 best practices or ways to execute it efficiently.`;
      else if (status === 'IN_REVIEW')   focus = `is pending review. Suggest 3 checklist items for the reviewer to verify.`;
      else focus = `is set to ${status}. Suggest 3 next steps to plan or proceed.`;
      return `A task "${title}" has changed status to "${status}". Context/Blocker: ${context || 'none'}.\n\n${focus} Return JSON: {"suggestions": ["step 1", "step 2", "step 3"]}`;
    }
  },
} as const;

// ── Feature functions ─────────────────────────────────────────────────────────

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

  const usageRatio = updated.aiCreditsUsed / updated.aiCreditsTotal;
  if (usageRatio >= 0.8 && usageRatio - (amount / updated.aiCreditsTotal) < 0.8) {
    const owners = await prisma.user.findMany({
      where: { orgId, role: { in: ['OWNER', 'COMPANY_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (owners.length > 0) {
      fanOutNotification(orgId, owners.map((u) => u.id), 'WEEKLY_DIGEST', {
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
      cards: { include: { user: { select: { name: true } } }, where: { status: 'SUBMITTED' } },
    },
  });
  if (!standup) return '';

  const hasCredits = await deductAiCredits(standup.department.orgId, 2);
  if (!hasCredits) return 'Insufficient AI credits';

  const p = PROMPTS.STANDUP_DIGEST;
  const cardSummaries = standup.cards.map((c) =>
    `${c.user.name}: Yesterday: ${c.yesterdaySummary || '—'} | Today: ${c.todayCommitments || '—'} | Blockers: ${c.blockers || 'None'}`
  ).join('\n');

  return callAI(p.user(cardSummaries), p.system(standup.department.name), 1800);
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
  return callAI(p.user(doneTasks, blockedTasks, standups), p.system, 43200);
}

export async function generateTaskSuggestions(taskId: string, orgId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, blockerType: true, description: true },
  });
  if (!task) return [];

  const hasCredits = await deductAiCredits(orgId, 1);
  if (!hasCredits) return [];

  const p = PROMPTS.TASK_SUGGESTIONS;
  const text = await callAI(
    p.user(task.title, task.blockerType ?? 'unknown', task.description ?? ''),
    p.system,
    1800
  );

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { suggestions?: unknown };
    return normalizeSuggestions(parsed.suggestions);
  } catch { return []; }
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
    BLOCKED:     ['Identify the root dependency or approval bottleneck and address it directly.', 'Set up a quick 5-minute sync with the blocker owner to align on next steps.', 'Escalate to the department head if the blocker resolution is delayed.'],
    IN_PROGRESS: ['Break down this task into smaller milestones or actionable sub-tasks.', 'Block dedicated focus time in your calendar to execute without distractions.', 'Share early drafts or progress with team members to get quick feedback.'],
    DONE:        ['Double check the completed work against the initial task requirements.', 'Request feedback or approval from the task assigner or team manager.', 'Document any key learnings or useful documentation from this work.'],
    IN_REVIEW:   ['Send a direct message or link to the reviewer to prompt their review.', 'Prepare a quick walkthrough or summary of the completed deliverables.', 'Be ready to iterate on the task if feedback or changes are requested.'],
    TODO:        ['Identify any prerequisite information or resources needed to start.', 'Estimate the time needed for completion and set a personal target.', 'Confirm the expected outcome with the task creator before beginning.'],
  };

  const fallbacks = fallbackSuggestions[status] || [
    'Define the next immediate action item to get started on this task.',
    'Align with relevant stakeholders on the priority and expected timeline.',
    'Check if any resources are missing that might delay progression.',
  ];

  try {
    const hasCredits = await deductAiCredits(orgId, 1);
    if (!hasCredits) return fallbacks;

    const context = blockerDetails || task.description || '';
    const p = PROMPTS.STATUS_CHANGE_SUGGESTIONS;
    const text = await callAI(p.user(task.title, status, context), p.system, 1800);
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { suggestions?: unknown };
    const suggestions = normalizeSuggestions(parsed.suggestions);
    return suggestions.length ? suggestions : fallbacks;
  } catch (error) {
    console.error('Error generating status suggestions, using fallback:', error);
    return fallbacks;
  }
}

export async function enhanceTaskWithGemini(
  title: string,
  description?: string,
  field: 'title' | 'description' | 'both' = 'both'
): Promise<{ title: string; description: string }> {
  let prompt: string;

  if (field === 'title') {
    prompt = `You are a professional project manager. Rewrite this task title to be clear, concise, and action-oriented (start with a verb). Keep the same intent. Return ONLY valid JSON with no markdown:
{"title":"improved title here"}

Task Title: ${title}`;
  } else if (field === 'description') {
    prompt = `You are a professional project manager. Rewrite this task description to be clear, detailed, and actionable. Use the task title as context. Return ONLY valid JSON with no markdown:
{"description":"improved description here"}

Task Title: ${title}
Task Description: ${description || '(none provided)'}`;
  } else {
    prompt = `You are a professional project manager. Enhance this task title and description to be clear, concise, and actionable. Keep the same intent. Return ONLY valid JSON with no markdown:
{"title":"improved title here","description":"improved description here"}

Task Title: ${title}
Task Description: ${description || '(none provided)'}`;
  }

  const text = (await callAIRaw(prompt)).trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned unexpected format');

  const parsed = JSON.parse(jsonMatch[0]) as { title?: string; description?: string };
  return {
    title: parsed.title || title,
    description: parsed.description || description || '',
  };
}

export async function callGroq(prompt: string, systemPrompt?: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  const groq = new Groq({ apiKey: key });
  const res = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ],
    max_tokens: 1024,
    response_format: { type: "json_object" }
  });
  return res.choices[0]?.message?.content ?? '';
}
