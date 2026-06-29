import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function main() {
  const queue = new Queue('report', { connection: redis });

  // Remove the old 8 PM IST (14:30 UTC) daily-report — correct key without 'repeat:' prefix
  await queue.removeRepeatableByKey('cc71b8987655cb25cdc4385af8db232a');
  console.log('Removed old 8 PM IST daily-report repeat job');

  // Verify
  const jobs = await queue.getRepeatableJobs();
  console.log('Remaining daily-report repeats:');
  jobs.filter((j) => j.name === 'daily-report').forEach((j) => {
    console.log(`  key=${j.key} pattern=${j.pattern} next=${new Date(j.next).toISOString()}`);
  });

  await queue.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
