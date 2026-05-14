import { Queue } from 'bullmq';
import redis from '../lib/redis';

const connection = redis;

export const standupQueue = new Queue('standup', { connection });
export const escalationQueue = new Queue('escalation', { connection });
export const notificationQueue = new Queue('notification', { connection });
export const aiQueue = new Queue('ai', { connection });
export const retentionQueue = new Queue('retention', { connection });

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
}
