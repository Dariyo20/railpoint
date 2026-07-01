import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { buildApp } from './api/app';
import { ensureDefaultMerchant } from './services/merchant';
import { startBillingRuntime } from './services/billing/runtime';

/**
 * The API server.
 *
 * In the default no-Redis mode (QUEUE_DRIVER=memory) the billing runtime runs
 * INSIDE this process — one command, no worker, no Redis, no Docker. In Redis
 * mode the runtime lives in the separate worker process instead.
 */
async function main() {
  await connectMongo();
  await ensureDefaultMerchant();

  if (env.queueDriver === 'memory') {
    await startBillingRuntime();
    logger.info('Billing runtime embedded in API process (no Redis)');
  } else {
    logger.info('QUEUE_DRIVER=redis: run the worker process separately (npm run start:worker)');
  }

  const app = buildApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, queue: env.queueDriver, nomba: env.nomba.mock ? 'mock' : 'live' }, 'Railpoint API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'API shutting down');
    server.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err: err?.message, stack: err?.stack }, 'API failed to start');
  process.exit(1);
});
