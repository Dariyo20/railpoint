import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../db/mongoose';
import { ensureDefaultMerchant } from '../services/merchant';
import { MemberModel, PlanModel, SubscriptionModel } from '../models';
import { createCheckoutOrder } from '../services/nomba';
import { handleWebhook } from '../services/webhook/handler';

/**
 * Seeds a ready-to-demo dataset:
 *   - one daily plan
 *   - two members (one with an expectedPayday)
 *   - two ACTIVE subscriptions (checkout + tokenization simulated end-to-end via
 *     the Nomba mock and the activation webhook), each with a first cycle due now.
 *
 * Run with MOCK_NOMBA=true. Then start the worker and either wait for the tick
 * or hit /demo/advance.
 */
async function activate(planId: string, memberId: string, email: string) {
  const orderReference = randomUUID();
  await SubscriptionModel.create({ planId, memberId, orderReference, status: 'pending' });
  await createCheckoutOrder({ orderReference, amountNaira: 10000, customerEmail: email });

  // Simulate Nomba's payment_success webhook so the token is saved and the first
  // cycle is created — exactly what happens after a real checkout.
  await handleWebhook({
    event_type: 'payment_success',
    requestId: randomUUID(),
    data: {
      merchant: {},
      transaction: {
        type: 'online_checkout',
        transactionId: `SEED-${randomUUID()}`,
        onlineCheckoutOrderReference: orderReference,
        onlineCheckoutCustomerEmail: email,
        onlineCheckoutTokenKey: `seed-token-${memberId}`,
        time: new Date().toISOString(),
      },
    },
  });
  const sub = await SubscriptionModel.findOne({ orderReference });
  return sub!._id.toString();
}

async function main() {
  if (!env.nomba.mock) {
    logger.warn('Seeding against LIVE Nomba is not supported; set MOCK_NOMBA=true');
  }
  await connectMongo();
  const merchantId = await ensureDefaultMerchant();

  const plan = await PlanModel.create({
    merchantId,
    name: 'Monthly Membership (demo: daily interval)',
    amount: 10000,
    interval: 'daily',
  });

  const alice = await MemberModel.create({
    merchantId,
    name: 'Alice Happy',
    email: 'alice@example.com',
  });
  const bob = await MemberModel.create({
    merchantId,
    name: 'Bob Recovery',
    email: 'bob@example.com',
    expectedPayday: 25,
  });

  const aliceSub = await activate(plan._id.toString(), alice._id.toString(), alice.email);
  const bobSub = await activate(plan._id.toString(), bob._id.toString(), bob.email);

  logger.info(
    {
      planId: plan._id.toString(),
      aliceSubscriptionId: aliceSub,
      bobSubscriptionId: bobSub,
    },
    'Seed complete. Use bobSubscriptionId with /demo/simulate-failure to show recovery.'
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      { planId: plan._id.toString(), aliceSubscriptionId: aliceSub, bobSubscriptionId: bobSub },
      null,
      2
    )
  );

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err: err?.message }, 'Seed failed');
  process.exit(1);
});
