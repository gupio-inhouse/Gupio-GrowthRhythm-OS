import redis from './redis';

const DEFAULT_TTL = 30; // seconds

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Cache failures are non-fatal
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Non-fatal
  }
}

export function cacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}
