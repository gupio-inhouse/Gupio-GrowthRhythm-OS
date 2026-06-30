import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function main() {
  const reportQueue = new Queue('report', { connection });

  console.log('=== REPORT QUEUE REPEATABLE JOBS ===');
  const repeatables = await reportQueue.getRepeatableJobs();
  for (const r of repeatables) {
    console.log(`- Job: ${r.name}`);
    console.log(`  Pattern: ${r.pattern}`);
    console.log(`  TZ: ${r.tz}`);
    console.log(`  Next execution (UTC): ${new Date(r.next).toISOString()}`);
    console.log(`  Next execution (IST): ${new Date(r.next).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
  }

  await reportQueue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
