import { logger } from '../../config/logger';
import { BillingCycleModel, RecoveryAttemptModel } from '../../models';
import { enqueueChargeCycle, enqueueRecoveryAttempt } from './queues';

/**
 * Immediately drive a cycle forward, regardless of its scheduled time. Used by
 * `POST /subscriptions/:id/charge`, `POST /demo/advance` and the worker.
 *  - scheduled  -> set dueDate=now and enqueue the initial charge
 *  - recovering -> enqueue the next pending recovery attempt now
 *  - partial    -> same as recovering
 *  - past_due   -> nothing to do from the card side (awaiting VA transfer)
 */
export async function triggerCycleNow(cycleId: string): Promise<{ triggered: string; detail?: string }> {
  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle) return { triggered: 'none', detail: 'cycle not found' };

  if (cycle.status === 'scheduled') {
    cycle.dueDate = new Date();
    await cycle.save();
    await enqueueChargeCycle({ cycleId, attemptNumber: 1 }, { delay: 0 });
    return { triggered: 'charge-cycle' };
  }

  if (cycle.status === 'recovering' || cycle.status === 'partial') {
    const next = await RecoveryAttemptModel.findOne({ cycleId: cycle._id, result: 'pending' }).sort({
      attemptNumber: 1,
    });
    if (next) {
      await enqueueRecoveryAttempt({ cycleId, attemptNumber: next.attemptNumber }, { delay: 0 });
      return { triggered: 'recovery-attempt', detail: `attempt ${next.attemptNumber}` };
    }
    return { triggered: 'none', detail: 'no pending recovery attempt' };
  }

  if (cycle.status === 'past_due') {
    return { triggered: 'none', detail: 'awaiting virtual-account transfer' };
  }

  return { triggered: 'none', detail: `cycle is ${cycle.status}` };
}

/**
 * Find the most recent open (non-paid) cycle for a subscription.
 */
export async function findOpenCycle(subscriptionId: string) {
  return BillingCycleModel.findOne({
    subscriptionId,
    status: { $ne: 'paid' },
  }).sort({ createdAt: -1 });
}
