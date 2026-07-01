import IORedis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';

/**
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`.
 * Upstash serves Redis over TLS (rediss://), which ioredis picks up from the URL.
 */
export function buildRedisConnection(): IORedis {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  return new IORedis(env.redisUrl, options);
}

// Shared connection for producers (the API enqueues jobs through this).
let shared: IORedis | null = null;
export function sharedRedis(): IORedis {
  if (!shared) shared = buildRedisConnection();
  return shared;
}
