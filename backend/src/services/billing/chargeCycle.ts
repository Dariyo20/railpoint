import { logger } from '../../config/logger';
import { BillingCycle, BillingCycleModel, Subscription, SubscriptionModel } from '../../models';
import { attemptCharge } from './chargeGateway';
import { applyCollection, setSubscriptionStatus } from './cycleService';
import { enterRecovery, virtualAccountFallback } from './recovery';
import { isHardCardError } from '../nomba/failureMap';

/**
 * The `charge-cycle` job — the initial scheduled charge for a cycle (attempt 1).
 * Mirrors PRD section 8.2.
 */
export async function processChargeCycle(cycleId: string, attemptNumber: number): Promise<void> {
  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle) {
    logger.warn({ cycleId }, 'charge-cycle: cycle not found');
    return;
  }
  // Idempotency guard: only act on a cycle that is still due to be charged.
  if (cycle.status !== 'scheduled') {
    logger.info({ cycleId, status: cycle.status }, 'charge-cycle: cycle not in scheduled state; skipping');
    return;
  }

  const sub = await SubscriptionModel.findById(cycle.subscriptionId).select('+tokenKey');
  if (!sub) {
    logger.warn({ cycleId }, 'charge-cycle: subscription not found');
    return;
  }
  if (sub.status === 'cancelled') {
    logger.info({ cycleId }, 'charge-cycle: subscription cancelled; skipping');
    return;
  }
  if (!sub.tokenKey) {
    logger.warn({ cycleId }, 'charge-cycle: no tokenKey on subscription; cannot charge');
    return;
  }

  const remaining = cycle.amountDue - cycle.amountCollected;

  const res = await attemptCharge({
    subscription: sub as unknown as Subscription & { tokenKey?: string | null },
    cycle: cycle as unknown as BillingCycle,
    amountNaira: remaining,
    type: 'full',
    attemptNumber,
    duringRecovery: false,
  });

  if (res.success) {
    await applyCollection(cycleId, remaining);
    await setSubscriptionStatus(sub._id.toString(), 'active');
    logger.info({ cycleId, amount: remaining }, 'charge-cycle: charged successfully, cycle paid');
    return;
  }

  // Failure branches.
  const reason = res.failureReason ?? 'unknown';
  if (isHardCardError(reason)) {
    // Hard card error -> skip straight to virtual-account fallback (PRD 8.2).
    logger.warn({ cycleId, reason }, 'charge-cycle: hard card error, going to virtual-account fallback');
    await BillingCycleModel.findByIdAndUpdate(cycleId, { status: 'past_due' });
    await virtualAccountFallback(cycleId, 'hard_card_error');
    return;
  }

  // Soft failure (insufficient_funds / timeout / unknown) -> enter recovery.
  logger.warn({ cycleId, reason }, 'charge-cycle: soft failure, entering Smart Recovery');
  await enterRecovery(cycle as unknown as BillingCycle);
}
