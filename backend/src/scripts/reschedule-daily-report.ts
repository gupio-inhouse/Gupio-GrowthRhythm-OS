import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function main() {
  const queue = new Queue('report', { connection: redis });

  // Remove the old 8 PM IST (14:30 UTC) daily-report repeat job
  const oldKey = 'repeat:cc71b8987655cb25cdc4385af8db232a';
  try {
    await queue.removeRepeatableByKey(oldKey);
    console.log('Removed old 8 PM IST repeat job');
  } catch (e) {
    console.warn('Could not remove old repeat key (may already be gone):', e);
  }

  // Register new 10:35 PM IST (17:05 UTC) schedule
  await queue.add('daily-report', {}, {
    repeat: { pattern: '5 17 * * *', tz: 'UTC' },
    jobId: 'daily-performance-report',
  });
  console.log('Scheduled daily-report at 17:05 UTC (10:35 PM IST)');

  // Verify
  const repeatable = await queue.getRepeatableJobs();
  const daily = repeatable.find((j) => j.name === 'daily-report');
  console.log('Next run:', daily?.next ? new Date(daily.next).toISOString() : 'not found');

  await queue.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
