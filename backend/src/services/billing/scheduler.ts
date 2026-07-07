import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { BillingCycleModel, RecoveryAttemptModel } from '../../models';
import { jobsEngine } from './queue';
import { JOB, enqueueChargeCycle, enqueueRecoveryAttempt } from './queues';

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

  // 1) Initial charges: scheduled cycles that are due.
  const due = await BillingCycleModel.find({ status: 'scheduled', dueDate: { $lte: now } }).select('_id');
  for (const c of due) {
    await enqueueChargeCycle({ cycleId: c._id.toString(), attemptNumber: 1 });
  }

  // 2) Recovery sweep (durability): the in-memory engine holds delayed retry
  //    jobs in process memory, so a restart/redeploy loses them. Re-enqueue any
  //    recovery attempt that is due but still pending. Deterministic jobIds mean
  //    this is a safe no-op when the original delayed job is still alive.
  const dueAttempts = await RecoveryAttemptModel.find({
    result: 'pending',
    strategy: { $in: ['card_full', 'card_partial'] },
    scheduledFor: { $lte: now },
  }).select('cycleId attemptNumber');
  let swept = 0;
  for (const a of dueAttempts) {
    // Only resurrect attempts whose cycle is still actively recovering.
    const cycle = await BillingCycleModel.findOne({
      _id: a.cycleId,
      status: { $in: ['recovering', 'partial'] },
    }).select('_id');
    if (!cycle) continue;
    await enqueueRecoveryAttempt({ cycleId: a.cycleId.toString(), attemptNumber: a.attemptNumber });
    swept++;
  }

  if (due.length || swept) {
    logger.info({ charges: due.length, recoveriesSwept: swept }, 'Billing tick');
  } else {
    logger.debug('Billing tick: nothing due');
  }
}
