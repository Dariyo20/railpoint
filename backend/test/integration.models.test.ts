import {
  applyCollection,
  createFirstCycle,
  createNextCycle,
  intervalMs,
} from '../src/services/billing/cycleService';
import { BillingCycleModel, SubscriptionModel } from '../src/models';
import { makeActiveSubscription, makePlan, makeMember } from './helpers';
import { randomUUID } from 'crypto';

describe('cycle/subscription state transitions', () => {
  it('intervalMs matches daily/weekly/monthly', () => {
    expect(intervalMs('daily')).toBe(24 * 3600 * 1000);
    expect(intervalMs('weekly')).toBe(7 * 24 * 3600 * 1000);
    expect(intervalMs('monthly')).toBe(30 * 24 * 3600 * 1000);
  });

  it('createFirstCycle makes a scheduled cycle due now', async () => {
    const plan = await makePlan({ amount: 7500 });
    const member = await makeMember();
    const sub = await SubscriptionModel.create({ planId: plan._id, memberId: member._id, orderReference: randomUUID(), status: 'active', tokenKey: 'tok' });
    const cycle = await createFirstCycle(sub._id.toString());
    expect(cycle.status).toBe('scheduled');
    expect(cycle.amountDue).toBe(7500);
    expect(cycle.dueDate.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('applyCollection: partial keeps the cycle open, full payment closes it and opens the next', async () => {
    const { sub, cycle } = await makeActiveSubscription({ amount: 10000 });

    // partial
    const afterPartial = await applyCollection(cycle._id.toString(), 4000);
    expect(afterPartial.amountCollected).toBe(4000);
    expect(afterPartial.status).toBe('partial');
    expect(await BillingCycleModel.countDocuments({ subscriptionId: sub._id })).toBe(1);

    // clear the rest
    const afterFull = await applyCollection(cycle._id.toString(), 6000);
    expect(afterFull.amountCollected).toBe(10000);
    expect(afterFull.status).toBe('paid');

    // next cycle opened, subscription active
    const cycles = await BillingCycleModel.find({ subscriptionId: sub._id }).sort({ createdAt: 1 });
    expect(cycles).toHaveLength(2);
    expect(cycles[1].status).toBe('scheduled');
    const s = await SubscriptionModel.findById(sub._id);
    expect(s!.status).toBe('active');
  });

  it('createNextCycle advances the period and sets the next charge date', async () => {
    const { sub, cycle } = await makeActiveSubscription({ amount: 10000 });
    const next = await createNextCycle(sub._id.toString(), cycle as any);
    expect(next.periodStart.getTime()).toBe(cycle.periodEnd.getTime());
    expect(next.status).toBe('scheduled');
    const s = await SubscriptionModel.findById(sub._id);
    expect(s!.nextChargeDate!.getTime()).toBe(next.dueDate.getTime());
  });
});
