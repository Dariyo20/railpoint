import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { buildApp } from './api/app';
import { ensureDefaultMerchant } from './services/merchant';

/**
 * The API server. Stateless and serverless-friendly. It enqueues BullMQ jobs but
 * does NOT process them — that is the worker's job (a long-running process).
 */
async function main() {
  await connectMongo();
  await ensureDefaultMerchant();

  const app = buildApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, nomba: env.nomba.mock ? 'mock' : 'live' }, 'Railpoint API listening');
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
