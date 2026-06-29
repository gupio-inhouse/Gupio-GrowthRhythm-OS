import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function main() {
  const queue = new Queue('report', { connection: redis });
  const jobs = await queue.getRepeatableJobs();
  console.log('All repeatable jobs in report queue:');
  jobs.forEach((j) => {
    console.log(`  name=${j.name} key=${j.key} pattern=${j.pattern} next=${j.next ? new Date(j.next).toISOString() : 'unknown'}`);
  });
  await queue.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
