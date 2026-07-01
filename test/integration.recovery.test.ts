import { randomUUID } from 'crypto';
import { processChargeCycle } from '../src/services/billing/chargeCycle';
import { runRecoveryAttempt } from '../src/services/billing/recovery';
import { totalRecovered } from '../src/services/billing/cycleService';
import { handleWebhook } from '../src/services/webhook/handler';
import {
  BillingCycleModel,
  RecoveryAttemptModel,
  SubscriptionModel,
} from '../src/models';
import { makeActiveSubscription } from './helpers';

/**
 * The differentiator. Asserts amountCollected and cycle/subscription status at
 * each step of the recovery arc.
 */
describe('Smart Recovery arc: fail -> payday-aware retry -> partial -> clear', () => {
  it('enters recovery on the first failure and schedules payday-aware attempts', async () => {
    const { sub, cycle } = await makeActiveSubscription({ amount: 10000, demoFailFullCharges: 2, expectedPayday: 25 });

    // Step 1: initial charge fails (insufficient funds).
    await processChargeCycle(cycle._id.toString(), 1);

    const c1 = await BillingCycleModel.findById(cycle._id);
    expect(c1!.status).toBe('recovering');
    expect(c1!.amountCollected).toBe(0);
    const s1 = await SubscriptionModel.findById(sub._id);
    expect(s1!.status).toBe('in_recovery');

    const attempts = await RecoveryAttemptModel.find({ cycleId: cycle._id }).sort({ attemptNumber: 1 });
    expect(attempts.map((a) => a.attemptNumber)).toEqual([2, 3, 4]);
    expect(attempts.every((a) => a.strategy === 'card_full')).toBe(true);
    expect(attempts.every((a) => !!a.scheduledFor)).toBe(true);
  });

  it('collects a partial on attempt 2, then clears the balance on attempt 3', async () => {
    const { sub, cycle } = await makeActiveSubscription({ amount: 10000, demoFailFullCharges: 2 });
    const cycleId = cycle._id.toString();

    await processChargeCycle(cycleId, 1); // fail -> recovering (fullFail 2->1)

    // Step 2: attempt 2 — full fails (1->0), partial (50% = 5000) succeeds.
    await runRecoveryAttempt(cycleId, 2);
    const c2 = await BillingCycleModel.findById(cycleId);
    expect(c2!.amountCollected).toBe(5000);
    expect(c2!.status).toBe('partial');
    const a2 = await RecoveryAttemptModel.findOne({ cycleId, attemptNumber: 2 });
    expect(a2!.result).toBe('partial');
    expect(a2!.strategy).toBe('card_partial');

    // Step 3: attempt 3 — full (fullFail now 0) succeeds for the remaining 5000.
    await runRecoveryAttempt(cycleId, 3);
    const c3 = await BillingCycleModel.findById(cycleId);
    expect(c3!.amountCollected).toBe(10000);
    expect(c3!.status).toBe('paid');
    const a3 = await RecoveryAttemptModel.findOne({ cycleId, attemptNumber: 3 });
    expect(a3!.result).toBe('success');

    // Subscription reactivated, next cycle opened.
    const s3 = await SubscriptionModel.findById(sub._id);
    expect(s3!.status).toBe('active');
    const cycles = await BillingCycleModel.find({ subscriptionId: sub._id });
    expect(cycles).toHaveLength(2);

    // Everything collected here was via recovery -> total recovered = 10000.
    expect(await totalRecovered()).toBe(10000);
  });

  it('does partial -> partial -> clear across multiple attempts', async () => {
    const { cycle } = await makeActiveSubscription({ amount: 10000, demoFailFullCharges: 3 });
    const cycleId = cycle._id.toString();

    await processChargeCycle(cycleId, 1); // fail (3->2) -> recovering
    await runRecoveryAttempt(cycleId, 2); // full fail (2->1), partial 5000 -> collected 5000
    expect((await BillingCycleModel.findById(cycleId))!.amountCollected).toBe(5000);

    await runRecoveryAttempt(cycleId, 3); // full fail (1->0), partial 2500 -> collected 7500
    expect((await BillingCycleModel.findById(cycleId))!.amountCollected).toBe(7500);

    await runRecoveryAttempt(cycleId, 4); // full (0) succeeds for remaining 2500 -> paid
    const c = await BillingCycleModel.findById(cycleId);
    expect(c!.amountCollected).toBe(10000);
    expect(c!.status).toBe('paid');
  });
});

describe('Smart Recovery: window exhausted -> virtual-account fallback -> VA credit clears it', () => {
  it('falls back to a virtual account when card attempts are exhausted, then reconciles a transfer', async () => {
    // Full charges always fail; partials keep shrinking the balance but never
    // fully clear, so the last attempt triggers the VA fallback.
    const { sub, cycle } = await makeActiveSubscription({ amount: 10000, demoFailFullCharges: 99 });
    const cycleId = cycle._id.toString();

    await processChargeCycle(cycleId, 1); // -> recovering
    await runRecoveryAttempt(cycleId, 2); // partial 5000 -> 5000
    await runRecoveryAttempt(cycleId, 3); // partial 2500 -> 7500
    await runRecoveryAttempt(cycleId, 4); // partial 1250 -> 8750, last attempt -> VA fallback

    const c = await BillingCycleModel.findById(cycleId);
    expect(c!.status).toBe('past_due');
    expect(c!.virtualAccount).toBeTruthy();
    expect(c!.virtualAccount!.bankAccountNumber).toBeTruthy();
    expect(c!.amountCollected).toBe(8750);

    const s = await SubscriptionModel.findById(sub._id);
    expect(s!.status).toBe('past_due');

    // Member transfers the outstanding 1250 to the virtual account -> Nomba fires
    // a payment_success (vact_transfer) webhook -> cycle clears.
    const outstanding = c!.amountDue - c!.amountCollected; // 1250
    const vaWebhook = {
      event_type: 'payment_success',
      requestId: randomUUID(),
      data: {
        merchant: {},
        transaction: {
          type: 'vact_transfer',
          transactionId: `VACT-${randomUUID()}`,
          transactionAmount: outstanding,
          aliasAccountNumber: c!.virtualAccount!.bankAccountNumber,
          time: new Date().toISOString(),
        },
      },
    };
    const res = await handleWebhook(vaWebhook);
    expect(res.status).toBe('va_credited');

    const cleared = await BillingCycleModel.findById(cycleId);
    expect(cleared!.amountCollected).toBe(10000);
    expect(cleared!.status).toBe('paid');
    const s2 = await SubscriptionModel.findById(sub._id);
    expect(s2!.status).toBe('active');
  });

  it('is idempotent on a redelivered VA credit (no double credit)', async () => {
    const { cycle } = await makeActiveSubscription({ amount: 10000, demoFailFullCharges: 99 });
    const cycleId = cycle._id.toString();
    await processChargeCycle(cycleId, 1);
    await runRecoveryAttempt(cycleId, 2);
    await runRecoveryAttempt(cycleId, 3);
    await runRecoveryAttempt(cycleId, 4);
    const c = await BillingCycleModel.findById(cycleId);
    const outstanding = c!.amountDue - c!.amountCollected;
    const requestId = randomUUID();
    const vaWebhook = {
      event_type: 'payment_success',
      requestId,
      data: { merchant: {}, transaction: { type: 'vact_transfer', transactionId: 'VACT-1', transactionAmount: outstanding, aliasAccountNumber: c!.virtualAccount!.bankAccountNumber, time: new Date().toISOString() } },
    };
    await handleWebhook(vaWebhook);
    const dup = await handleWebhook(vaWebhook); // same requestId
    expect(dup.status).toBe('duplicate');
    const cleared = await BillingCycleModel.findById(cycleId);
    expect(cleared!.amountCollected).toBe(10000); // not over-collected
  });
});
