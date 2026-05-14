import prisma from '../lib/prisma';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_MODEL = 'claude-haiku-4-5-20251001';

interface ClaudeMessage { role: 'user' | 'assistant'; content: string }

export async function callClaude(prompt: string, systemPrompt?: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const body: Record<string, unknown> = {
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt } as ClaudeMessage],
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
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

  await prisma.organization.update({
    where: { id: orgId },
    data: { aiCreditsUsed: { increment: amount } },
  });
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

  const cardSummaries = standup.cards.map((c) =>
    `${c.user.name}: Yesterday: ${c.yesterdaySummary || '—'} | Today: ${c.todayCommitments || '—'} | Blockers: ${c.blockers || 'None'}`
  ).join('\n');

  return callClaude(
    `Summarise this standup in 3 bullet points. Be concise.\n\n${cardSummaries}`,
    `You are an AI assistant for ${standup.department.name} team. Extract key themes: accomplishments, commitments, and blockers.`
  );
}

export async function generateGoalSuggestions(description: string, orgId: string): Promise<string[]> {
  const hasCredits = await deductAiCredits(orgId, 1);
  if (!hasCredits) return [];

  const text = await callClaude(
    `Based on this business goal: "${description}"\n\nSuggest 3-5 KRAs (Key Result Areas) in JSON format: {"kras": ["KRA 1", "KRA 2"]}`,
    'You are an OKR expert for Indian SMBs. Return only valid JSON.'
  );

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

  return callClaude(
    `Write a crisp weekly executive digest for an Indian SMB:\n- Tasks completed this week: ${doneTasks}\n- Tasks currently blocked: ${blockedTasks}\n- Standups held: ${standups}\n\nHighlight wins, flag concerns, give 2 recommendations. Max 150 words.`,
    'You are a business performance coach for Indian SMBs. Be direct and actionable.'
  );
}
