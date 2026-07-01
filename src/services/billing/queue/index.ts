import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { JobsEngine } from './engine';
import { MemoryEngine } from './memoryEngine';

export * from './engine';

let engine: JobsEngine | null = null;

/**
 * The single job engine for the process. Defaults to the in-process memory
 * engine (no Redis). Set QUEUE_DRIVER=redis (and a real REDIS_URL) to scale out.
 */
export function jobsEngine(): JobsEngine {
  if (!engine) {
    if (env.queueDriver === 'redis') {
      // Lazy require so bullmq/ioredis are only loaded when actually used.
      const { RedisEngine } = require('./redisEngine') as typeof import('./redisEngine');
      engine = new RedisEngine(env.redisUrl);
      logger.info('Job engine: redis (BullMQ)');
    } else {
      engine = new MemoryEngine();
      logger.info('Job engine: in-memory (no Redis required)');
    }
  }
  return engine;
}

/** For tests: swap in a specific engine and reset. */
export function __setEngine(e: JobsEngine | null): void {
  engine = e;
}
