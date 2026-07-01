import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  BillingCycle,
  BillingCycleModel,
  ChargeModel,
  PlanModel,
  Subscription,
  SubscriptionModel,
} from '../../models';
import { PlanInterval } from '../../models/Plan';

const DAY_MS = 24 * 60 * 60 * 1000;

export function intervalMs(interval: PlanInterval): number {
  switch (interval) {
    case 'daily':
      return DAY_MS;
    case 'weekly':
      return 7 * DAY_MS;
    case 'monthly':
      return 30 * DAY_MS;
  }
}

/**
 * Create the first billing cycle for a freshly-activated subscription.
 * Due immediately (dueDate = now) so the very first charge runs on the next tick.
 */
export async function createFirstCycle(subscriptionId: string): Promise<BillingCycle> {
  const sub = await SubscriptionModel.findById(subscriptionId);
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
  const plan = await PlanModel.findById(sub.planId);
  if (!plan) throw new Error(`Plan ${sub.planId} not found`);

  const now = new Date();
  const periodEnd = new Date(now.getTime() + intervalMs(plan.interval as PlanInterval));

  const cycle = await BillingCycleModel.create({
    subscriptionId: sub._id,
    periodStart: now,
    periodEnd,
    dueDate: now,
    amountDue: plan.amount,
    amountCollected: 0,
    status: 'scheduled',
    recoveryDeadline: new Date(now.getTime() + env.billing.recoveryWindowDays * DAY_MS),
  });

  sub.nextChargeDate = now;
  await sub.save();

  logger.info({ subscriptionId, cycleId: cycle._id.toString(), amountDue: cycle.amountDue }, 'First billing cycle created');
  return cycle as unknown as BillingCycle;
}

/**
 * Advance the subscription to the next cycle after one is fully paid.
 */
export async function createNextCycle(subscriptionId: string, fromCycle: BillingCycle): Promise<BillingCycle> {
  const sub = await SubscriptionModel.findById(subscriptionId);
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
  const plan = await PlanModel.findById(sub.planId);
  if (!plan) throw new Error(`Plan ${sub.planId} not found`);

  const periodStart = fromCycle.periodEnd;
  const periodEnd = new Date(periodStart.getTime() + intervalMs(plan.interval as PlanInterval));

  const cycle = await BillingCycleModel.create({
    subscriptionId: sub._id,
    periodStart,
    periodEnd,
    dueDate: periodEnd, // next charge is at the end of this period
    amountDue: plan.amount,
    amountCollected: 0,
    status: 'scheduled',
    recoveryDeadline: new Date(periodEnd.getTime() + env.billing.recoveryWindowDays * DAY_MS),
  });

  sub.nextChargeDate = periodEnd;
  sub.status = 'active';
  await sub.save();

  logger.info({ subscriptionId, cycleId: cycle._id.toString() }, 'Next billing cycle created');
  return cycle as unknown as BillingCycle;
}

/**
 * Apply a collected amount to a cycle. Marks the cycle paid/partial, and on
 * full payment advances the subscription and opens the next cycle.
 * Returns the (possibly newly created) state.
 */
export async function applyCollection(cycleId: string, amount: number): Promise<BillingCycle> {
  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle) throw new Error(`Cycle ${cycleId} not found`);

  cycle.amountCollected += amount;
  const remaining = cycle.amountDue - cycle.amountCollected;

  if (remaining <= 0) {
    cycle.status = 'paid';
    await cycle.save();
    await createNextCycle(cycle.subscriptionId.toString(), cycle as unknown as BillingCycle);
  } else {
    // Money came in but not the full amount -> partial, stays recoverable.
    if (cycle.status === 'scheduled') cycle.status = 'partial';
    else if (cycle.status === 'recovering') cycle.status = 'partial';
    await cycle.save();
  }
  return cycle as unknown as BillingCycle;
}

export async function setSubscriptionStatus(
  subscriptionId: string,
  status: Subscription['status']
): Promise<void> {
  await SubscriptionModel.findByIdAndUpdate(subscriptionId, { status });
}

/**
 * Total amount the Smart Recovery engine has clawed back across all cycles.
 * Powers the dashboard's live "total recovered" counter.
 */
export async function totalRecovered(): Promise<number> {
  const rows = await ChargeModel.aggregate([
    { $match: { status: 'success', duringRecovery: true } },
    { $group: { _id: null, total: { $sum: '$amountCharged' } } },
  ]);
  return rows[0]?.total ?? 0;
}
