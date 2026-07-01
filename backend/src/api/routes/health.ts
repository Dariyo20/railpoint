import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const ok = mongoOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    mongo: mongoOk ? 'up' : 'down',
    queue: env.queueDriver, // 'memory' (no Redis) or 'redis'
    nomba: env.nomba.mock ? 'mock' : 'live',
    time: new Date().toISOString(),
  });
});
