import { logger } from '../../config/logger';
import { BillingCycle, Charge, ChargeModel, Subscription, SubscriptionModel } from '../../models';
import { chargeToken } from '../nomba';
import { FailureReason } from '../../models/Charge';
import { decryptToken } from '../crypto/token';

/**
 * Wraps a single card-charge attempt: applies the /demo/simulate-failure
 * control, calls the Nomba adapter, and writes exactly one Charge record with a
 * deterministic idempotency key. The deterministic key is unique in Mongo, so a
 * retried job that re-runs this with the same (cycle, attempt, type) cannot
 * double-charge — the second insert fails and we surface the original outcome.
 */

export interface AttemptChargeInput {
  subscription: Subscription & { tokenKey?: string | null };
  cycle: BillingCycle;
  amountNaira: number;
  type: 'full' | 'partial';
  attemptNumber: number;
  duringRecovery: boolean;
}

export interface AttemptChargeOutput {
  charge: Charge;
  success: boolean;
  failureReason?: FailureReason;
}

function idempotencyKey(cycleId: string, attempt: number, type: 'full' | 'partial'): string {
  return `charge:${cycleId}:${attempt}:${type}`;
}

export async function attemptCharge(input: AttemptChargeInput): Promise<AttemptChargeOutput> {
  const { subscription, cycle, amountNaira, type, attemptNumber, duringRecovery } = input;
  const cycleId = cycle._id.toString();
  const key = idempotencyKey(cycleId, attemptNumber, type);

  // Idempotency: if a charge with this key already exists, return it as-is.
  const existing = await ChargeModel.findOne({ idempotencyKey: key });
  if (existing) {
    logger.warn({ key }, 'Charge already exists for idempotency key; skipping re-charge');
    return {
      charge: existing as unknown as Charge,
      success: existing.status === 'success',
      failureReason: (existing.failureReason as FailureReason) ?? undefined,
    };
  }

  // ─── Demo control: force this FULL charge to fail with insufficient_funds ──
  // Partial charges are never force-failed, so the demo can show partial
  // collection ticking the balance down between forced full failures.
  let simulatedFail = false;
  if (type === 'full' && (subscription.demoFailFullCharges ?? 0) > 0) {
    simulatedFail = true;
    await SubscriptionModel.findByIdAndUpdate(subscription._id, { $inc: { demoFailFullCharges: -1 } });
  }

  let result;
  if (simulatedFail) {
    result = {
      success: false,
      code: '51',
      message: 'Insufficient funds (simulated)',
      nombaRef: null as string | null,
      failureReason: 'insufficient_funds' as FailureReason,
      simulated: true,
    };
  } else {
    const tokenKey = decryptToken(subscription.tokenKey); // decrypt at rest
    if (!tokenKey) throw new Error(`Subscription ${subscription._id} has no tokenKey`);
    const member = await getCustomerEmail(subscription);
    result = await chargeToken({
      tokenKey,
      amountNaira,
      customerEmail: member,
      orderReference: subscription.orderReference ?? cycleId,
      idempotencyKey: key,
    });
  }

  const charge = await ChargeModel.create({
    cycleId: cycle._id,
    subscriptionId: subscription._id,
    amountAttempted: amountNaira,
    amountCharged: result.success ? amountNaira : 0,
    type,
    method: 'card',
    status: result.success ? 'success' : 'failed',
    failureReason: result.success ? null : result.failureReason ?? 'unknown',
    nombaRef: result.nombaRef,
    nombaMessage: result.message,
    idempotencyKey: key,
    duringRecovery,
    simulated: (result as any).simulated ?? false,
    attemptedAt: new Date(),
  });

  // NOTE: tokenKey is deliberately never included in this log.
  logger.info(
    {
      cycleId,
      attemptNumber,
      type,
      amountNaira,
      success: result.success,
      reason: result.success ? undefined : charge.failureReason,
      nombaRef: result.nombaRef,
    },
    result.success ? 'Card charge succeeded' : 'Card charge failed'
  );

  return {
    charge: charge as unknown as Charge,
    success: result.success,
    failureReason: result.success ? undefined : (charge.failureReason as FailureReason),
  };
}

async function getCustomerEmail(subscription: Subscription): Promise<string> {
  const populated = await SubscriptionModel.findById(subscription._id).populate('memberId');
  const member: any = populated?.memberId;
  return member?.email ?? 'unknown@railpoint.local';
}
