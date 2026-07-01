import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { sharedRedis } from '../../redis/connection';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    // Race the ping against a short timeout so a misconfigured/unreachable Redis
    // can never hang the health check.
    const pong = await Promise.race([
      sharedRedis().ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    redisOk = pong === 'PONG';
  } catch {
    redisOk = false;
  }
  const ok = mongoOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    mongo: mongoOk ? 'up' : 'down',
    redis: redisOk ? 'up' : 'down',
    nomba: env.nomba.mock ? 'mock' : 'live',
    time: new Date().toISOString(),
  });
});
