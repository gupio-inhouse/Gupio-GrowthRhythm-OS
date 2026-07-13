import prisma from '../lib/prisma';

export type NotificationEvent =
  | 'TASK_ASSIGNED'
  | 'TASK_BLOCKED'
  | 'TASK_SUBMITTED_FOR_REVIEW'
  | 'TASK_DUE_TODAY'
  | 'TASK_OVERDUE'
  | 'STANDUP_REMINDER'
  | 'WEEKLY_DIGEST'
  | 'BLOCKER_ESCALATED'
  | 'BUG_ASSIGNED'
  | 'BUG_STATUS_CHANGED'
  | 'BUG_REOPENED'
  | 'BUG_COMMENT_ADDED';

const TEMPLATES: Record<NotificationEvent, (d: Record<string, unknown>) => { title: string; body: string }> = {
  TASK_ASSIGNED: (d) => ({ title: 'New task assigned', body: `You've been assigned: "${d.taskTitle}"${d.dueDate ? ` · due ${d.dueDate}` : ''}` }),
  TASK_BLOCKED: (d) => ({ title: 'Task blocked', body: `"${d.taskTitle}" is blocked: ${d.blockerType || 'Unknown reason'}` }),
  TASK_SUBMITTED_FOR_REVIEW: (d) => ({ title: 'Task ready for review', body: `${d.assigneeName || 'A team member'} marked "${d.taskTitle}" complete and needs your review.` }),
  TASK_DUE_TODAY: (d) => ({ title: 'Task due today', body: `"${d.taskTitle}" is due today — mark it done before EOD.` }),
  TASK_OVERDUE: (d) => ({ title: 'Task overdue', body: `"${d.taskTitle}" was due ${d.dueDate} and is still open.` }),
  STANDUP_REMINDER: (d) => ({ title: 'Standup in 15 minutes', body: `${d.departmentName} daily standup starts at ${d.time}` }),
  WEEKLY_DIGEST: (d) => ({ title: 'Your weekly summary', body: `Week ended: ${d.done} tasks done · ${d.blocked} blocked · ${d.standups} standups` }),
  BLOCKER_ESCALATED: (d) => ({ title: 'Blocker escalated', body: `"${d.taskTitle}" blocked for 3+ days. Needs immediate attention.` }),
  BUG_ASSIGNED: (d) => ({ title: 'Bug assigned to you', body: `${d.assignedByName || 'Someone'} assigned you bug "${d.bugTitle}"${d.projectName ? ` in ${d.projectName}` : ''}` }),
  BUG_STATUS_CHANGED: (d) => ({ title: 'Bug status updated', body: `"${d.bugTitle}" is now ${d.toStatus}${d.changedByName ? ` (by ${d.changedByName})` : ''}` }),
  BUG_REOPENED: (d) => ({ title: 'Bug reopened', body: `${d.reopenedByName || 'Someone'} reopened "${d.bugTitle}"` }),
  BUG_COMMENT_ADDED: (d) => ({ title: 'New comment on bug', body: `${d.commenterName || 'Someone'} commented on "${d.bugTitle}"` }),
};

const EVENT_PREF_KEY: Record<NotificationEvent, string> = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_BLOCKED: 'taskBlocked',
  TASK_SUBMITTED_FOR_REVIEW: 'taskAssigned',
  TASK_DUE_TODAY: 'taskAssigned',
  TASK_OVERDUE: 'taskBlocked',
  STANDUP_REMINDER: 'standupReminder',
  WEEKLY_DIGEST: 'weeklyDigest',
  BLOCKER_ESCALATED: 'taskBlocked',
  BUG_ASSIGNED: 'taskAssigned',
  BUG_STATUS_CHANGED: 'taskAssigned',
  BUG_REOPENED: 'taskBlocked',
  BUG_COMMENT_ADDED: 'taskAssigned',
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

// M10.4: check quiet hours for org
async function isQuietHours(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { quietHoursStart: true, quietHoursEnd: true },
  });
  if (!org || org.quietHoursStart == null || org.quietHoursEnd == null) return false;
  const nowH = new Date().getUTCHours() + 5; // rough IST approximation
  const { quietHoursStart: start, quietHoursEnd: end } = org;
  if (start > end) {
    return nowH >= start || nowH < end; // overnight: e.g. 22–7
  }
  return nowH >= start && nowH < end;
}

export async function fanOutNotification(
  orgId: string,
  userIds: string[],
  event: NotificationEvent,
  data: Record<string, unknown>
) {
  if (userIds.length === 0) return { count: 0 };

  // M10.4: skip non-critical notifications during quiet hours
  const criticalEvents: NotificationEvent[] = ['TASK_BLOCKED', 'BLOCKER_ESCALATED'];
  if (!criticalEvents.includes(event) && await isQuietHours(orgId)) {
    return { count: 0, skipped: 'quiet_hours' };
  }

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

// M10.5: mark notification delivery as failed and schedule retry
export async function markNotificationFailed(notificationId: string, errorMessage: string) {
  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { retryCount: true },
  });
  if (!notif) return;

  const maxRetries = 3;
  const newRetryCount = (notif.retryCount ?? 0) + 1;

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: newRetryCount >= maxRetries ? 'FAILED' : 'RETRIED',
      retryCount: newRetryCount,
      errorMessage,
    },
  });
}

// M10.6: get failed notifications for admin
export async function getFailedNotifications(orgId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { orgId, status: 'FAILED' },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
