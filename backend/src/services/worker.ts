import { Worker, Job } from 'bullmq';
import redis from '../lib/redis';
import prisma from '../lib/prisma';
import { fanOutNotification, createNotification } from './notification.service';
import { generateWeeklyDigest } from './ai.service';
import { generateMeetUrl } from './meet.service';
import { sendTaskDueTodayEmail, sendTaskDueReminderEmail, sendTaskOverdueEmail, sendStandupReminderEmail, deliverEmail, setEmailQueue, sendEmail } from './email.service';
import { emailQueue, reportQueue, recurringTaskQueue } from './queues';
import { buildOrgReport, renderReportHtml, renderReportText, isLastDayOfMonthIST } from './report.service';
import { getUserDeptAccess } from '../lib/deptAccess';

const APP_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

// Register the queue so sendEmail() routes through BullMQ
setEmailQueue(emailQueue);

const connection = redis;

// ── Standup worker: nightly card pre-generation ───────────────────────────────
export const standupWorker = new Worker('standup', async (job: Job) => {
  if (job.name !== 'generate-cards') return;

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: {
      users: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
  });

  let created = 0;

  for (const dept of departments) {
    if (dept.users.length === 0) continue;

    // Build tomorrow's scheduledAt using each dept's configured standupTime (IST = UTC+5:30)
    const [sh, sm] = (dept.standupTime || '09:00').split(':').map(Number);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    // Convert IST HH:MM → UTC: subtract 5h30m
    const utcMinutes = sh * 60 + sm - 330;
    tomorrow.setUTCHours(Math.floor(utcMinutes / 60), utcMinutes % 60, 0, 0);

    // Create tomorrow's standup (idempotent)
    let standup = await prisma.standup.findFirst({
      where: { departmentId: dept.id, scheduledAt: tomorrow },
    });
    if (!standup) {
      // Use department's saved link first; fall back to Google Calendar integration
      const meetUrl = dept.standupMeetUrl
        || await generateMeetUrl(dept.orgId, dept.slug, dept.name, tomorrow, dept.standupDuration ?? 15);
      standup = await prisma.standup.create({
        data: { orgId: dept.orgId, departmentId: dept.id, scheduledAt: tomorrow, timerMinutes: dept.standupDuration ?? 15, meetUrl },
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

    // Find overdue tasks (not done, past due date). Tasks already submitted for
    // review are excluded — the delay clock freezes once it's out of the
    // assignee's hands, so they shouldn't keep getting escalation nags for it.
    const overdue = await prisma.task.findMany({
      where: {
        status: { notIn: ['DONE', 'CANCELLED', 'IN_REVIEW'] },
        dueDate: { lt: new Date() },
      },
      include: {
        assignee: { select: { id: true, orgId: true } },
        department: { select: { name: true } },
      },
      take: 200,
    });

    for (const task of overdue) {
      if (!task.assignee) continue;
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
      if (!task.assignee) continue;
      // In-app only — no escalation to dept head/manager/CEO
      await fanOutNotification(
        task.assignee.orgId,
        [task.assignee.id],
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

    // Only remind if a standup is actually scheduled for today
    const standup = await prisma.standup.findFirst({
      where: { departmentId: dept.id, scheduledAt: { gte: today, lt: tomorrow } },
      select: { meetUrl: true },
    });
    if (!standup) continue;

    await fanOutNotification(
      dept.orgId,
      dept.users.map((u) => u.id),
      'STANDUP_REMINDER',
      { departmentName: dept.name, time: dept.standupTime, minutesUntil: 15 }
    );

    // Send email to each member (disabled: standup reminder emails stopped)
    // for (const user of dept.users) {
    //   sendStandupReminderEmail({
    //     to: user.email,
    //     name: user.name,
    //     departmentName: dept.name,
    //     standupTime: dept.standupTime,
    //     meetUrl: standup.meetUrl ?? null,
    //     appUrl: APP_URL,
    //   }).catch(console.error);
    // }

    reminded++;
  }

  if (reminded > 0) console.log(`[t15-worker] Sent T-15 in-app reminders to ${reminded} departments`);
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

  // Drop any reminder or meeting emails that may still be queued in Redis
  if (
    subject.startsWith('Standup in 15 minutes') ||
    subject.startsWith('Due today:') ||
    subject.startsWith('Reminder: "') ||
    subject.startsWith("You're invited —") ||
    subject.includes('review is coming up')
  ) {
    console.log(`[email-worker] Skipped disabled reminder/meeting email to ${to}: "${subject}"`);
    return;
  }

  await deliverEmail({ to, subject, html, text });
  console.log(`[email-worker] Delivered to ${to}: "${subject}"`);
}, {
  connection,
  concurrency: 5,
});

emailWorker.on('failed', (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

// ── Task reminder worker: due today + due tomorrow + overdue ──────────────────
export const taskReminderWorker = new Worker('task-reminder', async (job: Job) => {
  if (job.name === 'check-due-today') {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const dueToday = await prisma.task.findMany({
      where: {
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: { assignee: { select: { id: true, name: true, email: true } } },
      take: 500,
    });

    let count = 0;
    for (const task of dueToday) {
      if (!task.dueDate || !task.assignee) continue;

      // Email (disabled: task due reminder emails stopped)
      // sendTaskDueTodayEmail({
      //   to: task.assignee.email,
      //   assigneeName: task.assignee.name,
      //   taskTitle: task.title,
      //   priority: task.priority,
      //   dueDate: task.dueDate,
      //   appUrl: APP_URL,
      // }).catch(console.error);

      // In-app notification
      createNotification(task.assignee.id, 'TASK_DUE_TODAY', {
        taskTitle: task.title,
        taskId: task.id,
      }).catch(console.error);

      count++;
    }
    console.log(`[task-reminder-worker] ${count} due-today alerts sent`);
    return;
  }

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
    if (!task.dueDate || !task.assignee) continue;
    // Task due reminder email (disabled: task due reminder emails stopped)
    // sendTaskDueReminderEmail({
    //   to: task.assignee.email,
    //   assigneeName: task.assignee.name,
    //   taskTitle: task.title,
    //   priority: task.priority,
    //   dueDate: task.dueDate,
    //   appUrl: APP_URL,
    // }).catch(console.error);
    remindedCount++;
  }

  // Overdue tasks (due date passed today, not yet done). Tasks already
  // submitted for review are excluded — the delay clock freezes once it's out
  // of the assignee's hands, so they shouldn't keep getting overdue emails.
  const overdue = await prisma.task.findMany({
    where: {
      status: { notIn: ['DONE', 'CANCELLED', 'IN_REVIEW'] },
      dueDate: { lt: now },
    },
    include: {
      assignee: { select: { name: true, email: true } },
    },
    take: 500,
  });

  let overdueCount = 0;
  for (const task of overdue) {
    if (!task.dueDate || !task.assignee) continue;
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

// ── Report worker: daily / weekly / monthly performance reports ───────────────
export const reportWorker = new Worker('report', async (job: Job) => {
  const isMonthlyCheck = job.name === 'monthly-report-check';
  const period: 'daily' | 'weekly' | 'monthly' =
    job.name === 'daily-report' ? 'daily' :
    job.name === 'weekly-report' ? 'weekly' : 'monthly';

  if (isMonthlyCheck && !isLastDayOfMonthIST()) return;

  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const org of orgs) {
    try {
      const report = await buildOrgReport(org.id, period);

      // Find owner(s)
      const owners = await prisma.user.findMany({
        where: { orgId: org.id, role: { in: ['OWNER', 'COMPANY_ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      });

      const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
      const subject = `${periodLabel} Performance Report — ${org.name}`;

      const text = renderReportText(report);

      // Send to each owner (full org view)
      for (const owner of owners) {
        const html = renderReportHtml(report, 'OWNER', owner.name, undefined, APP_URL);
        sendEmail({ to: owner.email, subject, html, text }).catch(console.error);
      }

      // Send dept heads their department's section (daily + weekly + monthly).
      // A cross-department access grant widens this: SPECIFIC adds those
      // departments' sections too, FULL sends the complete org report.
      {
        const deptHeads = await prisma.user.findMany({
          where: { orgId: org.id, role: 'DEPARTMENT_HEAD', status: 'ACTIVE' },
          select: { id: true, name: true, email: true, departmentId: true, role: true },
        });

        for (const head of deptHeads) {
          const access = await getUserDeptAccess(head.id, org.id, head.role);

          if (access?.accessType === 'FULL') {
            const html = renderReportHtml(report, 'DEPT_HEAD', head.name, undefined, APP_URL);
            sendEmail({ to: head.email, subject, html, text }).catch(console.error);
            continue;
          }

          const deptIds = new Set<string>(access?.accessType === 'SPECIFIC' ? access.departmentIds : []);
          if (head.departmentId) deptIds.add(head.departmentId);
          if (deptIds.size === 0) continue;

          const html = renderReportHtml(report, 'DEPT_HEAD', head.name, [...deptIds], APP_URL);
          sendEmail({ to: head.email, subject, html, text }).catch(console.error);
        }
      }

      console.log(`[report-worker] Sent ${period} report for org ${org.id} to ${owners.length} owners`);
    } catch (e) {
      console.error(`[report-worker] Error for org ${org.id} (${period}):`, e);
    }
  }
}, { connection });

// ── Recurring task worker: spawns daily/weekly/monthly/yearly/custom copies ───
export const recurringTaskWorker = new Worker('recurring-task', async (job: Job) => {
  if (job.name !== 'spawn-recurring') return;

  const now = new Date();
  const todayUTCStart = new Date(now);
  todayUTCStart.setUTCHours(0, 0, 0, 0);

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDayName  = DAY_NAMES[now.getUTCDay()];
  const todayDayOfMonth = now.getUTCDate();
  const todayMonth    = now.getUTCMonth();

  // Only original (non-copy) tasks that have a recurrence set
  const recurringTasks = await prisma.task.findMany({
    where: {
      recurrence: { not: null },
      status: { not: 'CANCELLED' },
      NOT: [{ sourceType: { startsWith: 'RECURRING:' } }],
    },
    select: {
      id: true, orgId: true, title: true, description: true, expectedOutcome: true,
      assigneeUserId: true, assignedByUserId: true, departmentId: true, teamId: true,
      priority: true, recurrence: true, dueDate: true, createdAt: true,
    },
  });

  let spawned = 0;

  for (const task of recurringTasks) {
    const rec = task.recurrence!;
    const ref = task.dueDate ?? task.createdAt;

    let shouldSpawn = false;
    if (rec === 'DAILY') {
      shouldSpawn = true;
    } else if (rec === 'WEEKLY') {
      shouldSpawn = ref.getUTCDay() === now.getUTCDay();
    } else if (rec === 'MONTHLY') {
      shouldSpawn = ref.getUTCDate() === todayDayOfMonth;
    } else if (rec === 'YEARLY') {
      shouldSpawn = ref.getUTCMonth() === todayMonth && ref.getUTCDate() === todayDayOfMonth;
    } else if (rec.startsWith('CUSTOM:')) {
      const days = rec.slice(7).split(',');
      shouldSpawn = days.includes(todayDayName);
    }

    if (!shouldSpawn) continue;

    // Idempotency: skip if already spawned today
    const alreadyExists = await prisma.task.findFirst({
      where: { sourceType: `RECURRING:${task.id}`, createdAt: { gte: todayUTCStart } },
    });
    if (alreadyExists) continue;

    const todayEnd = new Date(todayUTCStart);
    todayEnd.setUTCHours(23, 59, 59, 999);

    await prisma.task.create({
      data: {
        orgId:           task.orgId,
        title:           task.title,
        description:     task.description,
        expectedOutcome: task.expectedOutcome,
        assigneeUserId:  task.assigneeUserId,
        assignedByUserId: task.assignedByUserId,
        departmentId:    task.departmentId,
        teamId:          task.teamId,
        priority:        task.priority,
        startDate:       now,
        dueDate:         todayEnd,
        sourceType:      `RECURRING:${task.id}`,
      },
    });

    // Notify the assignee
    if (task.assigneeUserId) {
      createNotification(task.assigneeUserId, 'TASK_ASSIGNED', {
        taskTitle: task.title,
        dueDate: todayEnd.toISOString().split('T')[0],
      }).catch(console.error);
    }

    spawned++;
  }

  console.log(`[recurring-task-worker] Spawned ${spawned} recurring tasks`);
}, { connection });

// ── Review worker: Tactical (15-day) / Strategic (45-day) cadence + reminders ──
const REVIEW_CYCLE_DAYS: Record<'TACTICAL' | 'STRATEGIC', number> = { TACTICAL: 15, STRATEGIC: 45 };

export const reviewWorker = new Worker('review', async (job: Job) => {
  if (job.name === 'check-cadence') {
    // Disabled as per user request to stop tactical and strategic review meetings
    return;
  }

  if (job.name === 'send-reminders') {
    // Disabled as per user request to stop review meeting reminders
    return;
  }
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
    reportWorker.close(),
    recurringTaskWorker.close(),
    reviewWorker.close(),
  ]);
}
