import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { BillingCycleModel } from '../../models';
import { jobsEngine } from './queue';
import { JOB, enqueueChargeCycle } from './queues';

/**
 * Register the repeatable billing tick on the job engine.
 */
export async function registerBillingTick(): Promise<void> {
  await jobsEngine().registerRepeatable(JOB.TICK, env.billing.tickMs);
  logger.info({ everyMs: env.billing.tickMs }, 'Billing tick registered');
}

/**
 * The tick body (PRD 8.1): find every scheduled cycle that is due, and enqueue
 * its initial charge-cycle job with a deterministic jobId so duplicates collapse.
 */
export async function processTick(): Promise<void> {
  const now = new Date();
  const due = await BillingCycleModel.find({ status: 'scheduled', dueDate: { $lte: now } }).select('_id');
  if (due.length === 0) {
    logger.debug('Billing tick: no due cycles');
    return;
  }
  for (const c of due) {
    await enqueueChargeCycle({ cycleId: c._id.toString(), attemptNumber: 1 });
  }
  logger.info({ count: due.length }, 'Billing tick: enqueued charge-cycle jobs');
}
