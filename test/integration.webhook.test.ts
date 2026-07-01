import { randomUUID } from 'crypto';
import { handleWebhook } from '../src/services/webhook/handler';
import { BillingCycleModel, SubscriptionModel } from '../src/models';
import { makePlan, makeMember } from './helpers';

async function pendingSub() {
  const plan = await makePlan();
  const member = await makeMember();
  const orderReference = randomUUID();
  const sub = await SubscriptionModel.create({ planId: plan._id, memberId: member._id, orderReference, status: 'pending' });
  return { sub, orderReference, email: member.email };
}

function activationPayload(orderReference: string, email: string, requestId = randomUUID()) {
  return {
    event_type: 'payment_success',
    requestId,
    data: {
      merchant: {},
      transaction: {
        type: 'online_checkout',
        transactionId: `TX-${requestId}`,
        onlineCheckoutOrderReference: orderReference,
        onlineCheckoutCustomerEmail: email,
        onlineCheckoutTokenKey: 'tok-from-webhook',
        time: new Date().toISOString(),
      },
    },
  };
}

describe('webhook activation + idempotency ledger', () => {
  it('activates a pending subscription, saves the token, and creates the first cycle', async () => {
    const { sub, orderReference, email } = await pendingSub();
    const res = await handleWebhook(activationPayload(orderReference, email));
    expect(res.status).toBe('activated');

    const activated = await SubscriptionModel.findById(sub._id).select('+tokenKey');
    expect(activated!.status).toBe('active');
    expect(activated!.tokenKey).toBe('tok-from-webhook');

    const cycles = await BillingCycleModel.find({ subscriptionId: sub._id });
    expect(cycles).toHaveLength(1);
    expect(cycles[0].status).toBe('scheduled');
    expect(cycles[0].amountDue).toBe(10000);
  });

  it('does NOT double-activate on redelivery of the same event (dedupe on requestId)', async () => {
    const { sub, orderReference, email } = await pendingSub();
    const payload = activationPayload(orderReference, email);

    const first = await handleWebhook(payload);
    const second = await handleWebhook(payload); // identical requestId

    expect(first.status).toBe('activated');
    expect(second.status).toBe('duplicate');

    const cycles = await BillingCycleModel.find({ subscriptionId: sub._id });
    expect(cycles).toHaveLength(1); // not two
  });

  it('resolves the token via List Tokenized Cards when the webhook omits it', async () => {
    const { sub, orderReference, email } = await pendingSub();
    const payload = activationPayload(orderReference, email);
    // Strip the inline token -> handler must fall back to listTokenizedCards (mock)
    delete (payload.data.transaction as any).onlineCheckoutTokenKey;

    const res = await handleWebhook(payload);
    expect(res.status).toBe('activated');
    const activated = await SubscriptionModel.findById(sub._id).select('+tokenKey');
    expect(activated!.tokenKey).toBe(`mock-token-${email}`);
  });
});
