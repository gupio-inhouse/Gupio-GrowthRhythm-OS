import { Queue } from 'bullmq';
import redis from '../lib/redis';

const JOB_ID = 'repeat:cc71b8987655cb25cdc4385af8db232a:1782743400000';

async function main() {
  const queue = new Queue('report', { connection: redis });

  const job = await queue.getJob(JOB_ID);
  if (!job) {
    console.error(`Job ${JOB_ID} not found in queue`);
    process.exit(1);
  }

  console.log(`Found job: ${job.name} (id: ${job.id}), state: ${await job.getState()}`);
  await job.retry('failed');
  console.log('Job moved back to waiting — worker will pick it up now');

  await queue.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
