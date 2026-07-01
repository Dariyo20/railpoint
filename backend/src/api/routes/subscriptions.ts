import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  BillingCycleModel,
  MemberModel,
  PlanModel,
  SubscriptionModel,
} from '../../models';
import { asyncHandler, ApiError, parseBody } from '../http';
import { createCheckoutOrder } from '../../services/nomba';
import { findOpenCycle, triggerCycleNow } from '../../services/billing/trigger';

export const subscriptionsRouter = Router();

const initiateSchema = z.object({
  planId: z.string().min(1),
  memberId: z.string().min(1),
});

/**
 * Create a Nomba checkout order with tokenization and a pending subscription.
 * The returned checkoutLink is where the member pays; the order reference lets
 * the webhook match the payment back to this subscription.
 */
subscriptionsRouter.post(
  '/subscriptions/initiate',
  asyncHandler(async (req, res) => {
    const body = parseBody(initiateSchema, req);

    const plan = await PlanModel.findById(body.planId);
    if (!plan) throw new ApiError(404, 'Plan not found');
    const member = await MemberModel.findById(body.memberId);
    if (!member) throw new ApiError(404, 'Member not found');

    const orderReference = randomUUID();

    const sub = await SubscriptionModel.create({
      planId: plan._id,
      memberId: member._id,
      orderReference,
      status: 'pending',
    });

    const order = await createCheckoutOrder({
      orderReference,
      amountNaira: plan.amount,
      customerEmail: member.email,
    });

    res.status(201).json({
      subscriptionId: sub._id.toString(),
      orderReference: order.orderReference,
      checkoutLink: order.checkoutLink,
      amount: plan.amount,
    });
  })
);

/**
 * Charge the saved token now. Used by the worker and the demo. Drives whichever
 * open cycle the subscription currently has.
 */
subscriptionsRouter.post(
  '/subscriptions/:id/charge',
  asyncHandler(async (req, res) => {
    const sub = await SubscriptionModel.findById(req.params.id);
    if (!sub) throw new ApiError(404, 'Subscription not found');

    const cycle = await findOpenCycle(sub._id.toString());
    if (!cycle) throw new ApiError(409, 'No open billing cycle to charge');

    const result = await triggerCycleNow(cycle._id.toString());
    res.status(202).json({ subscriptionId: sub._id.toString(), cycleId: cycle._id.toString(), ...result });
  })
);

/**
 * Dashboard list: subscriptions with member, plan, status, next charge, and
 * current cycle balances. tokenKey is never selected, so it can never leak.
 */
subscriptionsRouter.get(
  '/subscriptions',
  asyncHandler(async (_req, res) => {
    const subs = await SubscriptionModel.find()
      .populate('memberId')
      .populate('planId')
      .sort({ createdAt: -1 })
      .lean();

    const out = await Promise.all(
      subs.map(async (s: any) => {
        const cycle = await BillingCycleModel.findOne({ subscriptionId: s._id })
          .sort({ createdAt: -1 })
          .lean();
        return {
          id: s._id,
          status: s.status,
          nextChargeDate: s.nextChargeDate,
          member: s.memberId && { id: s.memberId._id, name: s.memberId.name, email: s.memberId.email },
          plan: s.planId && {
            id: s.planId._id,
            name: s.planId.name,
            amount: s.planId.amount,
            interval: s.planId.interval,
          },
          currentCycle: cycle && {
            id: cycle._id,
            status: cycle.status,
            amountDue: cycle.amountDue,
            amountCollected: cycle.amountCollected,
            amountRemaining: Math.max(0, cycle.amountDue - cycle.amountCollected),
            dueDate: cycle.dueDate,
            virtualAccount: cycle.virtualAccount ?? null,
          },
        };
      })
    );

    res.json(out);
  })
);
