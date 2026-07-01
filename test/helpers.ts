import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import {
  MemberModel,
  PlanModel,
  SubscriptionModel,
  BillingCycleModel,
} from '../src/models';
import { env } from '../src/config/env';

const DAY_MS = 24 * 60 * 60 * 1000;
const oid = () => new Types.ObjectId();

export async function makePlan(overrides: Partial<{ amount: number; interval: string }> = {}) {
  return PlanModel.create({
    merchantId: oid(),
    name: 'Test Plan',
    amount: overrides.amount ?? 10000,
    interval: (overrides.interval as any) ?? 'daily',
  });
}

export async function makeMember(overrides: Partial<{ email: string; expectedPayday: number }> = {}) {
  return MemberModel.create({
    merchantId: oid(),
    name: 'Test Member',
    email: overrides.email ?? `member-${randomUUID()}@example.com`,
    expectedPayday: overrides.expectedPayday ?? null,
  });
}

/**
 * Create an ACTIVE subscription with a saved token and a scheduled first cycle
 * due now — the state right after a successful checkout + activation.
 */
export async function makeActiveSubscription(
  opts: {
    amount?: number;
    tokenKey?: string;
    demoFailFullCharges?: number;
    expectedPayday?: number;
  } = {}
) {
  const plan = await makePlan({ amount: opts.amount ?? 10000 });
  const member = await makeMember({ expectedPayday: opts.expectedPayday });
  const sub = await SubscriptionModel.create({
    planId: plan._id,
    memberId: member._id,
    orderReference: randomUUID(),
    tokenKey: opts.tokenKey ?? `tok-${randomUUID()}`,
    status: 'active',
    nextChargeDate: new Date(),
    demoFailFullCharges: opts.demoFailFullCharges ?? 0,
  });
  const now = new Date();
  const cycle = await BillingCycleModel.create({
    subscriptionId: sub._id,
    periodStart: now,
    periodEnd: new Date(now.getTime() + DAY_MS),
    dueDate: now,
    amountDue: opts.amount ?? 10000,
    amountCollected: 0,
    status: 'scheduled',
    recoveryDeadline: new Date(now.getTime() + env.billing.recoveryWindowDays * DAY_MS),
  });
  return { plan, member, sub, cycle };
}
