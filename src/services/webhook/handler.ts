import { logger } from '../../config/logger';
import {
  BillingCycleModel,
  ChargeModel,
  SubscriptionModel,
  WebhookEventModel,
} from '../../models';
import { listTokenizedCards } from '../nomba';
import { fromNombaAmount } from '../nomba/amount';
import { applyCollection, createFirstCycle, setSubscriptionStatus } from '../billing/cycleService';

export interface HandleResult {
  status: 'duplicate' | 'ignored' | 'activated' | 'va_credited' | 'unhandled';
  detail?: string;
}

/**
 * Pull values from the several places Nomba may carry them. The documented
 * payment_success payload does not always inline the card token, so we look in
 * the transaction record and fall back to the List Tokenized Cards endpoint.
 */
function pickOrderReference(data: any): string | undefined {
  return (
    data?.order?.orderReference ||
    data?.transaction?.onlineCheckoutOrderReference ||
    data?.transaction?.orderReference ||
    data?.orderReference ||
    undefined
  );
}

function pickTokenKey(data: any): string | undefined {
  const t =
    data?.tokenizedCardData?.tokenKey ||
    data?.transaction?.onlineCheckoutTokenKey ||
    data?.order?.tokenKey;
  if (!t || t === 'N/A') return undefined;
  return t;
}

function pickCustomerEmail(data: any): string | undefined {
  return (
    data?.transaction?.onlineCheckoutCustomerEmail ||
    data?.order?.customerEmail ||
    data?.customer?.email ||
    undefined
  );
}

/**
 * Process a verified Nomba webhook. Caller has already verified the signature.
 * This function is idempotent: it dedupes on `requestId` and guards each side
 * effect so a redelivery cannot double-activate or double-credit.
 */
export async function handleWebhook(payload: any): Promise<HandleResult> {
  const requestId: string | undefined = payload?.requestId;
  const eventType: string | undefined = payload?.event_type;

  if (!requestId || !eventType) {
    return { status: 'ignored', detail: 'missing requestId or event_type' };
  }

  // ─── Dedupe ledger (PRD 7.3) ────────────────────────────────────────────
  const seen = await WebhookEventModel.findOne({ nombaEventId: requestId });
  if (seen) {
    logger.info({ requestId, eventType }, 'Webhook duplicate ignored');
    return { status: 'duplicate' };
  }

  let result: HandleResult = { status: 'unhandled' };

  if (eventType === 'payment_success') {
    result = await handlePaymentSuccess(payload);
  } else if (eventType === 'payment_failed') {
    // Informational; the billing engine drives card retries itself.
    logger.info({ requestId }, 'payment_failed webhook received (informational)');
    result = { status: 'ignored', detail: 'payment_failed informational' };
  } else {
    logger.info({ requestId, eventType }, 'Unhandled webhook event type');
    result = { status: 'ignored', detail: `unhandled ${eventType}` };
  }

  // Record the event AFTER processing so a thrown error lets Nomba retry.
  await WebhookEventModel.create({
    nombaEventId: requestId,
    type: eventType,
    payload,
  });

  return result;
}

async function handlePaymentSuccess(payload: any): Promise<HandleResult> {
  const data = payload?.data ?? {};
  const transaction = data.transaction ?? {};

  // ── Branch 1: virtual-account inbound transfer reconciling a past_due cycle ─
  const aliasAccountNumber: string | undefined = transaction.aliasAccountNumber;
  if (aliasAccountNumber) {
    const cycle = await BillingCycleModel.findOne({
      'virtualAccount.bankAccountNumber': aliasAccountNumber,
      status: { $ne: 'paid' },
    });
    if (cycle) {
      return creditVirtualAccount(payload, cycle._id.toString());
    }
  }

  // ── Branch 2: card checkout payment activating a pending subscription ──────
  const orderReference = pickOrderReference(data);
  if (!orderReference) {
    return { status: 'ignored', detail: 'no orderReference and no matching virtual account' };
  }

  const sub = await SubscriptionModel.findOne({ orderReference }).select('+tokenKey');
  if (!sub) {
    return { status: 'ignored', detail: `no subscription for orderReference ${orderReference}` };
  }
  if (sub.status !== 'pending' && sub.tokenKey) {
    // Already activated by a prior delivery.
    return { status: 'activated', detail: 'already active' };
  }

  // Resolve the card token: inline first, else look it up by email.
  let tokenKey = pickTokenKey(data);
  if (!tokenKey) {
    const email = pickCustomerEmail(data);
    if (email) {
      try {
        const list = await listTokenizedCards(email);
        tokenKey = list.tokenizedCardDataList?.[0]?.tokenKey;
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to list tokenized cards for token recovery');
      }
    }
  }

  if (!tokenKey) {
    return { status: 'ignored', detail: 'payment_success but no tokenKey could be resolved' };
  }

  sub.tokenKey = tokenKey;
  sub.status = 'active';
  await sub.save();

  await createFirstCycle(sub._id.toString());

  // Never log the tokenKey itself.
  logger.info({ subscriptionId: sub._id.toString(), orderReference }, 'Subscription activated; token saved');
  return { status: 'activated' };
}

async function creditVirtualAccount(payload: any, cycleId: string): Promise<HandleResult> {
  const requestId: string = payload.requestId;
  const amount = fromNombaAmount(payload?.data?.transaction?.transactionAmount ?? 0);

  // Idempotency: one credit per webhook requestId.
  const key = `va:${requestId}`;
  const exists = await ChargeModel.findOne({ idempotencyKey: key });
  if (exists) return { status: 'duplicate', detail: 'va credit already applied' };

  const cycle = await BillingCycleModel.findById(cycleId);
  if (!cycle) return { status: 'ignored', detail: 'cycle vanished' };

  await ChargeModel.create({
    cycleId: cycle._id,
    subscriptionId: cycle.subscriptionId,
    amountAttempted: amount,
    amountCharged: amount,
    type: 'full',
    method: 'virtual_account',
    status: 'success',
    nombaRef: payload?.data?.transaction?.transactionId ?? null,
    nombaMessage: 'Virtual account transfer',
    idempotencyKey: key,
    duringRecovery: true,
    attemptedAt: new Date(),
  });

  const updated = await applyCollection(cycleId, amount);
  if (updated.status === 'paid') {
    await setSubscriptionStatus(cycle.subscriptionId.toString(), 'active');
  }

  logger.info({ cycleId, amount, cleared: updated.status === 'paid' }, 'Virtual-account credit applied');
  return { status: 'va_credited', detail: updated.status };
}
