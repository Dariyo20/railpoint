import { Worker, Job } from 'bullmq';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { buildRedisConnection } from './redis/connection';
import { BILLING_QUEUE, JOB, ChargeCycleJob, RecoveryAttemptJob } from './services/billing/queues';
import { registerBillingTick, processTick } from './services/billing/scheduler';
import { processChargeCycle } from './services/billing/chargeCycle';
import { runRecoveryAttempt } from './services/billing/recovery';

/**
 * The billing worker. This is a LONG-RUNNING process and CANNOT run on Vercel
 * serverless — deploy it on Render/Railway/Fly. It owns the repeatable billing
 * tick and processes charge-cycle and recovery-attempt jobs.
 */
async function main() {
  await connectMongo();
  await registerBillingTick();

  const connection = buildRedisConnection();

  const worker = new Worker(
    BILLING_QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case JOB.TICK:
          return processTick();
        case JOB.CHARGE_CYCLE: {
          const { cycleId, attemptNumber } = job.data as ChargeCycleJob;
          return processChargeCycle(cycleId, attemptNumber);
        }
        case JOB.RECOVERY_ATTEMPT: {
          const { cycleId, attemptNumber } = job.data as RecoveryAttemptJob;
          return runRecoveryAttempt(cycleId, attemptNumber);
        }
        default:
          logger.warn({ name: job.name }, 'Unknown job name');
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on('completed', (job) => logger.debug({ id: job.id, name: job.name }, 'Job completed'));
  worker.on('failed', (job, err) =>
    logger.error({ id: job?.id, name: job?.name, err: err?.message }, 'Job failed')
  );
  worker.on('error', (err) => logger.error({ err: err?.message }, 'Worker error'));

  logger.info({ queue: BILLING_QUEUE, tickMs: env.billing.tickMs }, 'Railpoint worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    await worker.close();
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
