/* eslint-disable no-console */
import { env } from '../config/env';
import { createCheckoutOrder, chargeToken } from '../services/nomba';
import { randomUUID } from 'crypto';

/**
 * Live sandbox smoke test (PRD section 14).
 *
 * Nomba sandbox failure triggers (verified in the docs, /docs/api-basics/testing):
 *   - INSUFFICIENT FUNDS  -> charge amount GREATER THAN 500,000
 *   - Declined "do not honor" -> test card 5484 4972 1831 7651
 *   - Success -> test card 5434 6210 7425 2808, OTP 9999
 *
 * This script:
 *   1) Creates a real checkout order and prints the checkoutLink. Open it and pay
 *      with the SUCCESS test card (tokenizeCard is on) to tokenize a card. The
 *      payment_success webhook then delivers the tokenKey to /webhooks/nomba.
 *   2) If SMOKE_TOKEN_KEY is set (a real tokenKey captured from step 1's webhook),
 *      it runs TWO real tokenized charges:
 *        a) amount 600,000  -> expected INSUFFICIENT-FUNDS decline (the failure the
 *           whole recovery demo depends on)
 *        b) amount 10,000   -> expected SUCCESS
 */
async function main() {
  if (env.nomba.mock) {
    console.error('MOCK_NOMBA=true. Set MOCK_NOMBA=false and use TEST credentials + sandbox URL to run the live smoke test.');
    process.exit(1);
  }
  if (env.nomba.baseUrl.includes('api.nomba.com') && process.env.FORCE_LIVE !== 'true') {
    console.error('Refusing to run against PRODUCTION (api.nomba.com) — real money. Use the sandbox URL, or set FORCE_LIVE=true to override.');
    process.exit(1);
  }

  const email = process.env.SMOKE_EMAIL ?? 'smoke@example.com';
  const orderReference = randomUUID();

  console.log(`\n[1] Creating checkout order (amount 10,000, tokenizeCard) at ${env.nomba.baseUrl} ...`);
  const order = await createCheckoutOrder({ orderReference, amountNaira: 10000, customerEmail: email });
  console.log('    orderReference:', order.orderReference);
  console.log('    checkoutLink  :', order.checkoutLink);
  console.log('    -> Open the link, pay with SUCCESS card 5434 6210 7425 2808, OTP 9999.');
  console.log('       Your webhook then receives the tokenKey. Put it in SMOKE_TOKEN_KEY to run the charges below.');

  const tokenKey = process.env.SMOKE_TOKEN_KEY;
  if (!tokenKey) {
    console.log('\n[2] SMOKE_TOKEN_KEY not set — skipping the live charge step. (Checkout-order call verified above.)');
    return;
  }

  console.log('\n[2a] Charging 600,000 -> expecting INSUFFICIENT-FUNDS decline ...');
  const declined = await chargeToken({ tokenKey, amountNaira: 600000, customerEmail: email, orderReference, idempotencyKey: `smoke:${orderReference}:decline` });
  console.log('     success:', declined.success, '| reason:', declined.failureReason, '| message:', declined.message);
  if (declined.success) console.warn('     !! expected a decline but got success — check the >500,000 rule for your account');

  console.log('\n[2b] Charging 10,000 -> expecting SUCCESS ...');
  const ok = await chargeToken({ tokenKey, amountNaira: 10000, customerEmail: email, orderReference, idempotencyKey: `smoke:${orderReference}:ok` });
  console.log('     success:', ok.success, '| message:', ok.message);

  console.log('\nSmoke test done.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err?.message);
  process.exit(1);
});
