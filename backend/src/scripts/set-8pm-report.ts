import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function main() {
  const queue = new Queue('report', { connection: redis });

  // Remove the 10:35 PM IST (17:05 UTC) job added previously
  const before = await queue.getRepeatableJobs();
  const toRemove = before.filter((j) => j.name === 'daily-report');
  for (const j of toRemove) {
    await queue.removeRepeatableByKey(j.key);
    console.log(`Removed: key=${j.key} pattern=${j.pattern}`);
  }

  // Add 8 PM IST (14:30 UTC)
  await queue.add('daily-report', {}, {
    repeat: { pattern: '30 14 * * *', tz: 'UTC' },
    jobId: 'daily-performance-report',
  });
  console.log('Added daily-report at 14:30 UTC (8 PM IST)');

  // Verify
  const after = await queue.getRepeatableJobs();
  after.filter((j) => j.name === 'daily-report').forEach((j) => {
    const next = j.next ? new Date(j.next).toISOString() : 'unknown';
    console.log(`  key=${j.key} pattern=${j.pattern} next=${next}`);
  });

  await queue.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
