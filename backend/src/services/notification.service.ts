import prisma from '../lib/prisma';

export type NotificationEvent =
  | 'TASK_ASSIGNED'
  | 'TASK_BLOCKED'
  | 'STANDUP_REMINDER'
  | 'KRA_STATUS_CHANGED'
  | 'WEEKLY_DIGEST'
  | 'BLOCKER_ESCALATED'
  | 'REVIEW_DUE';

const TEMPLATES: Record<NotificationEvent, (d: Record<string, unknown>) => { title: string; body: string }> = {
  TASK_ASSIGNED: (d) => ({ title: 'New task assigned', body: `You've been assigned: "${d.taskTitle}"${d.dueDate ? ` · due ${d.dueDate}` : ''}` }),
  TASK_BLOCKED: (d) => ({ title: 'Task blocked', body: `"${d.taskTitle}" is blocked: ${d.blockerType || 'Unknown reason'}` }),
  STANDUP_REMINDER: (d) => ({ title: 'Standup in 15 minutes', body: `${d.departmentName} daily standup starts at ${d.time}` }),
  KRA_STATUS_CHANGED: (d) => ({ title: 'KRA status update', body: `"${d.kraName}" is now ${d.status}` }),
  WEEKLY_DIGEST: (d) => ({ title: 'Your weekly summary', body: `Week ended: ${d.done} tasks done · ${d.blocked} blocked · ${d.standups} standups` }),
  BLOCKER_ESCALATED: (d) => ({ title: 'Blocker escalated', body: `"${d.taskTitle}" blocked for 3+ days. Needs immediate attention.` }),
  REVIEW_DUE: (d) => ({ title: 'Review scheduled', body: `${d.reviewType} review for ${d.departmentName} is due ${d.dueDate}` }),
};

const EVENT_PREF_KEY: Record<NotificationEvent, string> = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_BLOCKED: 'taskBlocked',
  STANDUP_REMINDER: 'standupReminder',
  KRA_STATUS_CHANGED: 'kraUpdate',
  WEEKLY_DIGEST: 'weeklyDigest',
  BLOCKER_ESCALATED: 'taskBlocked',
  REVIEW_DUE: 'reviewDue',
};

async function getUserOrgId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { orgId: true } });
  return user?.orgId ?? null;
}

export async function createNotification(
  userId: string,
  event: NotificationEvent,
  data: Record<string, unknown>
) {
  const orgId = await getUserOrgId(userId);
  if (!orgId) return null;
  const tmpl = TEMPLATES[event](data);
  return prisma.notification.create({
    data: {
      userId,
      orgId,
      channel: 'DASHBOARD',
      type: event,
      payload: { ...tmpl, event, ...data },
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

export async function fanOutNotification(
  orgId: string,
  userIds: string[],
  event: NotificationEvent,
  data: Record<string, unknown>
) {
  if (userIds.length === 0) return { count: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, notificationPrefs: true },
  });

  const prefKey = EVENT_PREF_KEY[event];
  const tmpl = TEMPLATES[event](data);

  const eligible = users.filter((u) => {
    const prefs = (u.notificationPrefs ?? {}) as Record<string, boolean>;
    return prefs[prefKey] !== false;
  });

  if (eligible.length === 0) return { count: 0 };

  return prisma.notification.createMany({
    data: eligible.map((u) => ({
      userId: u.id,
      orgId,
      channel: 'DASHBOARD' as const,
      type: event,
      payload: { ...tmpl, event, ...data },
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
    skipDuplicates: true,
  });
}
