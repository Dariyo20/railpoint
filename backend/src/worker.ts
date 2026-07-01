import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { startBillingRuntime } from './services/billing/runtime';
import { jobsEngine } from './services/billing/queue';

/**
 * Dedicated billing worker — for QUEUE_DRIVER=redis deployments where you scale
 * the billing engine independently of the API. This is a LONG-RUNNING process.
 *
 * In the default no-Redis mode you do NOT need this: the API process runs the
 * billing runtime in-process. This entry still works standalone in memory mode
 * (useful for running only the engine), but memory jobs are per-process, so the
 * API's enqueues would not reach a separate memory-mode worker — use Redis mode
 * if you want them to be different processes.
 */
async function main() {
  await connectMongo();
  await startBillingRuntime();

  logger.info({ engine: env.queueDriver }, 'Railpoint worker started');
  if (env.queueDriver === 'memory') {
    logger.warn('QUEUE_DRIVER=memory: jobs are per-process. For a separate worker, set QUEUE_DRIVER=redis.');
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    await jobsEngine().close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err: err?.message, stack: err?.stack }, 'Worker failed to start');
  process.exit(1);
});
