import { Worker, Job } from 'bullmq';
import redis from '../lib/redis';
import prisma from '../lib/prisma';
import { fanOutNotification } from './notification.service';
import { generateWeeklyDigest } from './ai.service';
import { generateMeetUrl } from './meet.service';
import { sendTaskDueReminderEmail, sendTaskOverdueEmail, sendStandupReminderEmail, deliverEmail, setEmailQueue } from './email.service';
import { emailQueue } from './queues';

const APP_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

// Register the queue so sendEmail() routes through BullMQ
setEmailQueue(emailQueue);

const connection = redis;

// ── Standup worker: nightly card pre-generation ───────────────────────────────
export const standupWorker = new Worker('standup', async (job: Job) => {
  if (job.name !== 'generate-cards') return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: {
      users: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
  });

  let created = 0;

  for (const dept of departments) {
    if (dept.users.length === 0) continue;

    // Create tomorrow's standup (idempotent)
    let standup = await prisma.standup.findFirst({
      where: { departmentId: dept.id, scheduledAt: tomorrow },
    });
    if (!standup) {
      const meetUrl = await generateMeetUrl(
        dept.orgId,
        dept.slug,
        dept.name,
        tomorrow,
        dept.standupDuration ?? 15
      );
      standup = await prisma.standup.create({
        data: { orgId: dept.orgId, departmentId: dept.id, scheduledAt: tomorrow, timerMinutes: 15, meetUrl },
      });
    }

    // Pre-generate a card for each active member
    for (const user of dept.users) {
      await prisma.standupCard.upsert({
        where: { standupId_userId: { standupId: standup.id, userId: user.id } },
        create: { standupId: standup.id, userId: user.id },
        update: {},
      });
      created++;
    }

    // Standup reminder notification T-15 min is handled by job scheduler
    await fanOutNotification(
      dept.orgId,
      dept.users.map((u) => u.id),
      'STANDUP_REMINDER',
      {
        departmentName: dept.name,
        time: dept.standupTime || '09:00',
        meetUrl: standup.meetUrl,
      }
    );
  }

  console.log(`[standup-worker] Generated cards for ${created} members across ${departments.length} depts`);
}, { connection });

// ── Escalation worker: overdue tasks + repeat blocker detection ───────────────
export const escalationWorker = new Worker('escalation', async (job: Job) => {
  if (job.name === 'check-overdue') {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);

    // Find overdue tasks (not done, past due date)
    const overdue = await prisma.task.findMany({
      where: {
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: { lt: new Date() },
      },
      include: {
        assignee: { select: { id: true, orgId: true } },
        department: { select: { name: true } },
      },
      take: 200,
    });

    for (const task of overdue) {
      await fanOutNotification(
        task.assignee.orgId,
        [task.assignee.id],
        'TASK_BLOCKED',
        { taskTitle: task.title, blockerType: 'OVERDUE' }
      );
    }

    console.log(`[escalation-worker] Notified ${overdue.length} overdue tasks`);
  }

  if (job.name === 'repeat-blockers') {
    // Tasks blocked for 3+ days (blockerCount >= 3 or blocked since > 3 days)
    const repeatedBlockers = await prisma.task.findMany({
      where: {
        status: 'BLOCKED',
        blockerCount: { gte: 3 },
      },
      include: {
        assignee: { select: { id: true, orgId: true } },
        department: { select: { id: true, headUserId: true } },
      },
      take: 100,
    });

    for (const task of repeatedBlockers) {
      const notifyIds = [task.assignee.id];
      if (task.department?.headUserId) notifyIds.push(task.department.headUserId);

      await fanOutNotification(
        task.assignee.orgId,
        [...new Set(notifyIds)],
        'BLOCKER_ESCALATED',
        { taskTitle: task.title, blockerCount: task.blockerCount }
      );
    }

    // Also bump blockerCount for currently blocked tasks
    await prisma.task.updateMany({
      where: { status: 'BLOCKED' },
      data: { blockerCount: { increment: 1 } },
    });

    console.log(`[escalation-worker] Escalated ${repeatedBlockers.length} repeat blockers`);
  }
}, { connection });

// ── Retention worker: clean up old data ──────────────────────────────────────
export const retentionWorker = new Worker('retention', async (job: Job) => {
  if (job.name !== 'cleanup') return;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const oneYearAgo = new Date(Date.now() - 365 * 86400000);

  // Delete old read notifications (90 days)
  const deletedNotifs = await prisma.notification.deleteMany({
    where: { openedAt: { lt: ninetyDaysAgo } },
  });

  // Delete cancelled tasks older than 1 year
  const deletedTasks = await prisma.task.deleteMany({
    where: { status: 'CANCELLED', updatedAt: { lt: oneYearAgo } },
  });

  console.log(`[retention-worker] Deleted ${deletedNotifs.count} notifications, ${deletedTasks.count} cancelled tasks`);
}, { connection });

// ── T-15 standup reminder worker ──────────────────────────────────────────────
export const reminderWorker = new Worker('standup-reminder', async (job: Job) => {
  if (job.name !== 'check-t15') return;

  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();

  // Target window: standups starting in 10–20 min from now (UTC)
  const windowStart = new Date(now.getTime() + 10 * 60000);
  const windowEnd = new Date(now.getTime() + 20 * 60000);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: {
      users: { where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true } },
    },
  });

  // Fetch today's standup meet URL per dept
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);

  let reminded = 0;
  for (const dept of departments) {
    if (!dept.standupTime || dept.users.length === 0) continue;

    // Parse "HH:MM" standup time in IST (UTC+5:30)
    const [sh, sm] = dept.standupTime.split(':').map(Number);
    const standupUtcMinutes = sh * 60 + sm - 330; // subtract IST offset
    const windowStartMin = windowStart.getUTCHours() * 60 + windowStart.getUTCMinutes();
    const windowEndMin = windowEnd.getUTCHours() * 60 + windowEnd.getUTCMinutes();

    // Normalize negative times
    const normalized = ((standupUtcMinutes % 1440) + 1440) % 1440;
    if (normalized < windowStartMin || normalized > windowEndMin) continue;

    await fanOutNotification(
      dept.orgId,
      dept.users.map((u) => u.id),
      'STANDUP_REMINDER',
      { departmentName: dept.name, time: dept.standupTime, minutesUntil: 15 }
    );

    // Fetch today's standup for the meet URL
    const standup = await prisma.standup.findFirst({
      where: { departmentId: dept.id, scheduledAt: { gte: today, lt: tomorrow } },
      select: { meetUrl: true },
    });

    // Send email to each member
    for (const user of dept.users) {
      sendStandupReminderEmail({
        to: user.email,
        name: user.name,
        departmentName: dept.name,
        standupTime: dept.standupTime,
        meetUrl: standup?.meetUrl ?? null,
        appUrl: APP_URL,
      }).catch(console.error);
    }

    reminded++;
  }

  if (reminded > 0) console.log(`[t15-worker] Sent T-15 reminders + emails to ${reminded} departments`);
}, { connection });

// AI worker — handles async AI requests
export const aiWorker = new Worker('ai', async (job: Job) => {
  if (job.name === 'weekly-digest') {
    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const org of orgs) {
      try {
        const digest = await generateWeeklyDigest(org.id);
        const owners = await prisma.user.findMany({
          where: { orgId: org.id, role: { in: ['OWNER', 'COMPANY_ADMIN'] }, status: 'ACTIVE' },
          select: { id: true },
        });
        if (owners.length > 0) {
          await fanOutNotification(org.id, owners.map((u) => u.id), 'WEEKLY_DIGEST', { digest });
        }
      } catch (e) {
        console.error(`[ai-worker] weekly-digest error for org ${org.id}:`, e);
      }
    }
  }
}, { connection });

// ── Email delivery worker (with retry) ───────────────────────────────────────
export const emailWorker = new Worker('email', async (job: Job) => {
  if (job.name !== 'send') return;
  const { to, subject, html, text } = job.data as { to: string; subject: string; html: string; text?: string };
  await deliverEmail({ to, subject, html, text });
  console.log(`[email-worker] Delivered to ${to}: "${subject}"`);
}, {
  connection,
  concurrency: 5,
});

emailWorker.on('failed', (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

// ── Task reminder worker: due tomorrow + overdue ──────────────────────────────
export const taskReminderWorker = new Worker('task-reminder', async (job: Job) => {
  if (job.name !== 'check-due-and-overdue') return;

  const now = new Date();

  // Window: tasks due between 23h and 25h from now (due tomorrow)
  const in23h = new Date(now.getTime() + 23 * 3600000);
  const in25h = new Date(now.getTime() + 25 * 3600000);

  const dueSoon = await prisma.task.findMany({
    where: {
      status: { notIn: ['DONE', 'CANCELLED'] },
      dueDate: { gte: in23h, lte: in25h },
    },
    include: {
      assignee: { select: { name: true, email: true } },
    },
    take: 500,
  });

  let remindedCount = 0;
  for (const task of dueSoon) {
    if (!task.dueDate) continue;
    sendTaskDueReminderEmail({
      to: task.assignee.email,
      assigneeName: task.assignee.name,
      taskTitle: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      appUrl: APP_URL,
    }).catch(console.error);
    remindedCount++;
  }

  // Overdue tasks (due date passed today, not yet done)
  const overdue = await prisma.task.findMany({
    where: {
      status: { notIn: ['DONE', 'CANCELLED'] },
      dueDate: { lt: now },
    },
    include: {
      assignee: { select: { name: true, email: true } },
    },
    take: 500,
  });

  let overdueCount = 0;
  for (const task of overdue) {
    if (!task.dueDate) continue;
    sendTaskOverdueEmail({
      to: task.assignee.email,
      assigneeName: task.assignee.name,
      taskTitle: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      appUrl: APP_URL,
    }).catch(console.error);
    overdueCount++;
  }

  console.log(`[task-reminder-worker] ${remindedCount} due-tomorrow reminders, ${overdueCount} overdue alerts sent`);
}, { connection });

// Graceful shutdown
export function shutdownWorkers() {
  return Promise.all([
    standupWorker.close(),
    escalationWorker.close(),
    retentionWorker.close(),
    aiWorker.close(),
    reminderWorker.close(),
    taskReminderWorker.close(),
    emailWorker.close(),
  ]);
}
