import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  BillingCycle,
  BillingCycleModel,
  MemberModel,
  RecoveryAttemptModel,
  Subscription,
  SubscriptionModel,
} from '../../models';
import { createVirtualAccount } from '../nomba';
import { attemptCharge } from './chargeGateway';
import { applyCollection, setSubscriptionStatus } from './cycleService';
import { enqueueRecoveryAttempt } from './queues';

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;

/** Load a subscription including the normally-hidden tokenKey. */
async function loadSubWithToken(subscriptionId: string) {
  return SubscriptionModel.findById(subscriptionId).select('+tokenKey');
}

/**
 * Compute the next payday date strictly after `from`. `payday` is a day of
 * month (1-28). We aim charges at 09:00 local on payday.
 */
export function nextPayday(from: Date, payday: number): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), payday, 9, 0, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

/** `count` points evenly spread across (from, to], last point == to. */
function evenlySpaced(from: Date, to: Date, count: number): Date[] {
  const span = Math.max(0, to.getTime() - from.getTime());
  return Array.from(
    { length: count },
    (_, i) => new Date(from.getTime() + Math.round((span * (i + 1)) / count))
  );
}

/**
 * Build the absolute schedule (Date objects) for recovery attempts 2..N.
 *  - Attempt 2 is payday-aware (member.expectedPayday or the default window).
 *  - Attempts 3, 4 follow +2 days each, as long as they fit the window.
 *  - If the next payday falls OUTSIDE the recovery window, or the +2-day steps
 *    would overrun the deadline, attempts are spread evenly across the window so
 *    they never collapse onto a single timestamp.
 *  - In DEMO_FAST_RECOVERY mode, attempts fire seconds apart so the whole arc is
 *    visible in under a minute.
 */
export function buildRecoverySchedule(
  now: Date,
  recoveryDeadline: Date,
  payday: number
): { attemptNumber: number; scheduledFor: Date }[] {
  const count = Math.max(0, env.billing.maxRecoveryAttempts - 1); // attempts 2..N
  if (count === 0) return [];

  let dates: Date[];

  if (env.billing.demoFastRecovery) {
    dates = Array.from({ length: count }, (_, i) => new Date(now.getTime() + (i + 1) * 5 * SECOND_MS));
  } else {
    const payDate = nextPayday(now, payday);
    if (payDate.getTime() >= recoveryDeadline.getTime()) {
      // Payday is beyond the window — spread attempts evenly across the window.
      dates = evenlySpaced(now, recoveryDeadline, count);
    } else {
      // Anchor attempt 2 on payday; step +2 days for the rest.
      const stepped: Date[] = [payDate];
      for (let i = 1; i < count; i++) {
        stepped.push(new Date(stepped[i - 1].getTime() + 2 * DAY_MS));
      }
      if (stepped[stepped.length - 1].getTime() > recoveryDeadline.getTime()) {
        // Steps overrun the deadline — keep payday anchor, spread the rest.
        dates = [payDate, ...evenlySpaced(payDate, recoveryDeadline, count - 1)];
      } else {
        dates = stepped;
      }
    }
  }

  return dates.map((scheduledFor, i) => ({ attemptNumber: i + 2, scheduledFor }));
}

/**
 * Enter recovery for a cycle whose initial (or a later) charge failed with a
 * soft reason. Schedules the delayed BullMQ retry jobs and records the planned
 * RecoveryAttempt rows. Idempotent: only schedules once per cycle.
 */
export async function enterRecovery(cycle: BillingCycle): Promise<void> {
  const fresh = await BillingCycleModel.findById(cycle._id);
  if (!fresh) return;
  if (fresh.recoveryAttemptsScheduled > 0) {
    logger.info({ cycleId: fresh._id.toString() }, 'Recovery already scheduled; skipping');
    return;
  }

  const sub = await SubscriptionModel.findById(fresh.subscriptionId).populate('memberId');
  const member: any = sub?.memberId;
  const payday = member?.expectedPayday ?? env.billing.defaultPayday;

  const now = new Date();
  const deadline = fresh.recoveryDeadline ?? new Date(now.getTime() + env.billing.recoveryWindowDays * DAY_MS);
  const schedule = buildRecoverySchedule(now, deadline, payday);

  fresh.status = 'recovering';
  fresh.recoveryAttemptsScheduled = schedule.length;
  await fresh.save();
  if (sub) await setSubscriptionStatus(sub._id.toString(), 'in_recovery');

  for (const item of schedule) {
    await RecoveryAttemptModel.create({
      cycleId: fresh._id,
      attemptNumber: item.attemptNumber,
      scheduledFor: item.scheduledFor,
      strategy: 'card_full',
      amountTarget: fresh.amountDue - fresh.amountCollected,
      result: 'pending',
    });
    const delay = Math.max(0, item.scheduledFor.getTime() - now.getTime());
    await enqueueRecoveryAttempt(
      { cycleId: fresh._id.toString(), attemptNumber: item.attemptNumber },
      { delay }
    );
  }

  logger.info(
    { cycleId: fresh._id.toString(), attempts: schedule.map((s) => s.attemptNumber), payday },
    'Entered recovery; retries scheduled'
  );
}

/**
 * Run a single scheduled recovery attempt: full-then-partial card charge.
 * Records the RecoveryAttempt result and, when the window is exhausted unpaid,
 * falls back to a virtual account.
 */
export async function runRecoveryAttempt(cycleId: string, attemptNumber: number): Promise<void> {
  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle) return;
  if (cycle.status === 'paid') {
    logger.info({ cycleId, attemptNumber }, 'Cycle already paid; recovery attempt no-op');
    return;
  }

  const attempt = await RecoveryAttemptModel.findOne({ cycleId: cycle._id, attemptNumber });
  const sub = await loadSubWithToken(cycle.subscriptionId.toString());
  if (!sub) return;

  const now = new Date();
  const remaining = cycle.amountDue - cycle.amountCollected;
  const windowClosed = cycle.recoveryDeadline ? now.getTime() >= cycle.recoveryDeadline.getTime() : false;
  const isLastAttempt = attemptNumber >= env.billing.maxRecoveryAttempts;

  // 1) Try a FULL charge for the remaining balance.
  const full = await attemptCharge({
    subscription: sub as unknown as Subscription & { tokenKey?: string | null },
    cycle: cycle as unknown as BillingCycle,
    amountNaira: remaining,
    type: 'full',
    attemptNumber,
    duringRecovery: true,
  });

  if (full.success) {
    await applyCollection(cycleId, remaining);
    if (attempt) {
      attempt.result = 'success';
      attempt.strategy = 'card_full';
      attempt.chargeId = full.charge._id;
      await attempt.save();
    }
    logger.info({ cycleId, attemptNumber, amount: remaining }, 'Recovery FULL charge cleared the cycle');
    return;
  }

  // A hard card error during recovery -> stop hammering the card, go to VA now.
  if (full.failureReason === 'card_error' || full.failureReason === 'do_not_honor') {
    await virtualAccountFallback(cycleId, 'hard_card_error');
    if (attempt) {
      attempt.result = 'failed';
      attempt.chargeId = full.charge._id;
      await attempt.save();
    }
    return;
  }

  // 2) Full failed (soft) -> try a PARTIAL charge for a floor amount.
  const partialAmount = Math.max(1, Math.floor(remaining * env.billing.partialChargeFraction));
  let partialCollected = false;
  if (partialAmount >= 1 && partialAmount < remaining) {
    const partial = await attemptCharge({
      subscription: sub as unknown as Subscription & { tokenKey?: string | null },
      cycle: cycle as unknown as BillingCycle,
      amountNaira: partialAmount,
      type: 'partial',
      attemptNumber,
      duringRecovery: true,
    });
    if (partial.success) {
      partialCollected = true;
      await applyCollection(cycleId, partialAmount);
      if (attempt) {
        attempt.result = 'partial';
        attempt.strategy = 'card_partial';
        attempt.amountTarget = partialAmount;
        attempt.chargeId = partial.charge._id;
        await attempt.save();
      }
      logger.info({ cycleId, attemptNumber, partialAmount }, 'Recovery PARTIAL charge collected');
    }
  }

  if (!partialCollected && attempt) {
    attempt.result = 'failed';
    attempt.chargeId = full.charge._id;
    await attempt.save();
    logger.info({ cycleId, attemptNumber }, 'Recovery attempt collected nothing; waiting for next');
  }

  // 3) Window exhausted and still owing -> virtual-account fallback.
  const after = await BillingCycleModel.findById(cycleId);
  if (after && after.status !== 'paid' && (windowClosed || isLastAttempt)) {
    await virtualAccountFallback(cycleId, windowClosed ? 'window_closed' : 'attempts_exhausted');
  }
}

/**
 * Virtual-account fallback (PRD 9.4). Create a Nomba virtual account for the
 * outstanding balance, attach it to the cycle, and move the cycle/subscription
 * to past_due. Reconciliation happens in the webhook handler when an inbound
 * transfer (payment_success / vact_transfer) credits this account.
 */
export async function virtualAccountFallback(cycleId: string, reason: string): Promise<void> {
  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle || cycle.status === 'paid') return;
  if (cycle.virtualAccount) {
    logger.info({ cycleId }, 'Virtual account already created for cycle');
    return;
  }

  const sub = await SubscriptionModel.findById(cycle.subscriptionId).populate('memberId');
  const member: any = sub?.memberId;
  const outstanding = cycle.amountDue - cycle.amountCollected;

  // accountRef must be 16-64 chars; accountName 8-64 chars.
  const accountRef = `railpoint-${cycleId}`.slice(0, 64).padEnd(16, '0');
  const accountName = (member?.name ? `Railpoint ${member.name}` : `Railpoint Member ${cycleId.slice(-6)}`).slice(0, 64);

  try {
    const va = await createVirtualAccount({
      accountRef,
      accountName,
      expectedAmountNaira: outstanding,
    });

    cycle.virtualAccount = {
      accountRef: va.accountRef,
      bankName: va.bankName,
      bankAccountNumber: va.bankAccountNumber,
      bankAccountName: va.bankAccountName,
      expectedAmount: outstanding,
      createdAt: new Date(),
    } as any;
    cycle.status = 'past_due';
    await cycle.save();

    if (sub) await setSubscriptionStatus(sub._id.toString(), 'past_due');

    await RecoveryAttemptModel.create({
      cycleId: cycle._id,
      attemptNumber: env.billing.maxRecoveryAttempts + 1,
      scheduledFor: new Date(),
      strategy: 'virtual_account',
      amountTarget: outstanding,
      result: 'pending',
    });

    logger.info(
      { cycleId, reason, outstanding, bankAccountNumber: va.bankAccountNumber, bankName: va.bankName },
      'Virtual-account fallback created; awaiting transfer'
    );
  } catch (err: any) {
    logger.error({ cycleId, err: err?.message }, 'Failed to create virtual-account fallback');
  }
}
