import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { BillingCycleModel, SubscriptionModel } from '../../models';
import { asyncHandler, ApiError, parseBody } from '../http';
import { findOpenCycle, triggerCycleNow } from '../../services/billing/trigger';
import { handleWebhook } from '../../services/webhook/handler';
import { logger } from '../../config/logger';

export const demoRouter = Router();

const advanceSchema = z
  .object({
    cycleId: z.string().optional(),
    subscriptionId: z.string().optional(),
  })
  .refine((d) => d.cycleId || d.subscriptionId, { message: 'cycleId or subscriptionId required' });

/**
 * `POST /demo/advance` — set a cycle's dueDate to now and fire it, so judges can
 * watch the auto-charge (or the next recovery attempt) happen on demand.
 */
demoRouter.post(
  '/demo/advance',
  asyncHandler(async (req, res) => {
    const body = parseBody(advanceSchema, req);

    let cycleId = body.cycleId;
    if (!cycleId && body.subscriptionId) {
      const cycle = await findOpenCycle(body.subscriptionId);
      if (!cycle) throw new ApiError(409, 'No open billing cycle for subscription');
      cycleId = cycle._id.toString();
    }
    if (!cycleId) throw new ApiError(400, 'cycleId or subscriptionId required');

    await BillingCycleModel.findByIdAndUpdate(cycleId, { dueDate: new Date() });
    const result = await triggerCycleNow(cycleId);
    res.status(202).json({ cycleId, ...result });
  })
);

const simulateFailureSchema = z.object({
  subscriptionId: z.string().min(1),
  // How many upcoming FULL charges should fail. Default 2 shows:
  // initial fail -> recovery full fail -> recovery partial collects ->
  // next recovery full succeeds -> cleared.
  fullFailures: z.number().int().min(1).max(10).optional(),
});

/**
 * `POST /demo/simulate-failure` — force the next N full charges on a
 * subscription to fail with insufficient_funds, so the recovery arc is visible.
 */
demoRouter.post(
  '/demo/simulate-failure',
  asyncHandler(async (req, res) => {
    const body = parseBody(simulateFailureSchema, req);
    const sub = await SubscriptionModel.findByIdAndUpdate(
      body.subscriptionId,
      { demoFailFullCharges: body.fullFailures ?? 2 },
      { new: true }
    );
    if (!sub) throw new ApiError(404, 'Subscription not found');
    res.json({
      subscriptionId: sub._id.toString(),
      demoFailFullCharges: sub.demoFailFullCharges,
      note: 'The next full card charge(s) will fail with insufficient_funds.',
    });
  })
);

const simulateVaCreditSchema = z.object({
  cycleId: z.string().min(1),
  amount: z.number().int().positive().optional(),
});

/**
 * `POST /demo/simulate-va-credit` — DEMO ONLY. Synthesizes the inbound-transfer
 * webhook that Nomba would send when a member funds the virtual-account
 * fallback, so the VA reconciliation path can be shown without a real transfer.
 */
demoRouter.post(
  '/demo/simulate-va-credit',
  asyncHandler(async (req, res) => {
    const body = parseBody(simulateVaCreditSchema, req);
    const cycle = await BillingCycleModel.findById(body.cycleId);
    if (!cycle) throw new ApiError(404, 'Cycle not found');
    if (!cycle.virtualAccount?.bankAccountNumber) {
      throw new ApiError(409, 'Cycle has no virtual account yet (recovery window not exhausted)');
    }

    const outstanding = cycle.amountDue - cycle.amountCollected;
    const amount = body.amount ?? outstanding;

    const synthetic = {
      event_type: 'payment_success',
      requestId: randomUUID(),
      data: {
        merchant: {},
        transaction: {
          type: 'vact_transfer',
          transactionId: `DEMO-VACT-${randomUUID()}`,
          transactionAmount: amount,
          aliasAccountNumber: cycle.virtualAccount.bankAccountNumber,
          time: new Date().toISOString(),
        },
        customer: { senderName: 'Demo Member' },
      },
    };

    logger.info({ cycleId: body.cycleId, amount }, 'Demo: simulating virtual-account credit');
    const result = await handleWebhook(synthetic);
    res.status(202).json({ cycleId: body.cycleId, amount, ...result });
  })
);
