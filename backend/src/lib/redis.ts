import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') console.error('[Redis]', err.message);
});

export default redis;
