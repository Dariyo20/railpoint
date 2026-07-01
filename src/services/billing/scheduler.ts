import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { BillingCycleModel } from '../../models';
import { billingQueue, JOB, enqueueChargeCycle } from './queues';

/**
 * Register the repeatable billing tick. BullMQ guarantees only one delivery per
 * scheduled slot. We use a stable repeat key so re-registering on every worker
 * boot does not create duplicate schedules.
 */
export async function registerBillingTick(): Promise<void> {
  const q = billingQueue();
  await q.add(
    JOB.TICK,
    {},
    {
      repeat: { every: env.billing.tickMs },
      jobId: 'billing-tick-repeatable',
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
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
