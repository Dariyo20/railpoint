import { logger } from '../../config/logger';
import { jobsEngine } from './queue';
import { JOB, ChargeCycleJob, RecoveryAttemptJob } from './queues';
import { registerBillingTick, processTick } from './scheduler';
import { processChargeCycle } from './chargeCycle';
import { runRecoveryAttempt } from './recovery';

/**
 * Start the billing worker: register the single job handler and the repeatable
 * tick on whichever engine is active (in-memory by default, Redis if configured).
 *
 * In the default no-Redis mode this runs INSIDE the API process (server.ts calls
 * it), so producer and consumer share the process. In Redis mode it runs in the
 * dedicated worker process (worker.ts).
 */
export async function startBillingRuntime(): Promise<void> {
  const engine = jobsEngine();

  engine.startWorker(async (name: string, data: any) => {
    switch (name) {
      case JOB.TICK:
        return processTick();
      case JOB.CHARGE_CYCLE: {
        const { cycleId, attemptNumber } = data as ChargeCycleJob;
        return processChargeCycle(cycleId, attemptNumber);
      }
      case JOB.RECOVERY_ATTEMPT: {
        const { cycleId, attemptNumber } = data as RecoveryAttemptJob;
        return runRecoveryAttempt(cycleId, attemptNumber);
      }
      default:
        logger.warn({ name }, 'Unknown job name');
    }
  });

  await registerBillingTick();
  logger.info({ engine: engine.kind }, 'Billing runtime started');
}
