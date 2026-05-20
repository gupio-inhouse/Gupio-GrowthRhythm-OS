import { Queue } from 'bullmq';
import redis from '../lib/redis';

const connection = redis;

export const standupQueue = new Queue('standup', { connection });
export const escalationQueue = new Queue('escalation', { connection });
export const notificationQueue = new Queue('notification', { connection });
export const aiQueue = new Queue('ai', { connection });
export const retentionQueue = new Queue('retention', { connection });
export const reminderQueue = new Queue('standup-reminder', { connection });
export const taskReminderQueue = new Queue('task-reminder', { connection });
export const emailQueue = new Queue('email', { connection, defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 }, // 1m, 2m, 4m
  removeOnComplete: 500,
  removeOnFail: 200,
} });

export async function scheduleRecurringJobs() {
  // Nightly standup card generation — every day 11 PM IST (17:30 UTC)
  await standupQueue.add('generate-cards', {}, {
    repeat: { pattern: '30 17 * * *' },
    jobId: 'nightly-standup-cards',
  });

  // Escalation check — every day 9 AM IST (03:30 UTC)
  await escalationQueue.add('check-overdue', {}, {
    repeat: { pattern: '30 3 * * *' },
    jobId: 'daily-escalation',
  });

  // 3-day repeat blocker detection — every day 9 AM IST
  await escalationQueue.add('repeat-blockers', {}, {
    repeat: { pattern: '30 3 * * *' },
    jobId: 'repeat-blocker-check',
  });

  // Weekly exec digest — every Monday 8 AM IST (02:30 UTC)
  await aiQueue.add('weekly-digest', {}, {
    repeat: { pattern: '30 2 * * 1' },
    jobId: 'weekly-exec-digest',
  });

  // Data retention cleanup — every Sunday 2 AM IST (20:30 UTC Saturday)
  await retentionQueue.add('cleanup', {}, {
    repeat: { pattern: '30 20 * * 0' },
    jobId: 'weekly-retention-cleanup',
  });

  // M5.3: T-15 reminder check — every 15 minutes
  await reminderQueue.add('check-t15', {}, {
    repeat: { pattern: '*/15 * * * *' },
    jobId: 't15-reminder-check',
  });

  // Task due-date reminder + overdue alerts — every day 8 AM IST (02:30 UTC)
  await taskReminderQueue.add('check-due-and-overdue', {}, {
    repeat: { pattern: '30 2 * * *' },
    jobId: 'daily-task-reminder',
  });
}
