# Nomba API — verified ground truth & divergences

Everything below was pulled from `developer.nomba.com` (via `llms.txt` and the
`.md` source of each reference/guide page) and pinned before any integration
code was written. The most important, security-critical piece — the webhook
signature scheme — is unit-checked against Nomba's own published test vector in
`src/services/webhook/verify.ts`.

## What matched the original assumptions

- Base URL `https://api.nomba.com/v1`; sandbox `https://sandbox.nomba.com/v1`. ✅
- Auth: OAuth2 `client_credentials`, `POST /auth/token/issue` with `client_id`,
  `client_secret`, `grant_type`, and an `accountId` header. ✅
- Create order: `POST /checkout/order` with `{ order:{...}, tokenizeCard:true }`,
  returns `data.checkoutLink` + `data.orderReference`. ✅
- Charge token: `POST /checkout/tokenized-card-payment` with `{ order:{...},
  tokenKey }`, success is code `"00"`. ✅ (The PRD's guessed `/checkout/token-charge`
  was wrong; the correct path is `/checkout/tokenized-card-payment`.)
- Amounts are **naira decimal strings** e.g. `"10000.00"`, not kobo. ✅

## Where the docs DIFFERED from the original ground truth

1. **Token lifetime is ~30 minutes, not ~1 hour.**
   The auth guide states access tokens expire after 30 minutes and recommends
   refreshing 5 minutes early via `POST /auth/token/refresh`
   (`{grant_type:"refresh_token", refresh_token}` with the old token as Bearer).
   → The adapter caches the token and refreshes ~5 min before `expiresAt`,
   falling back to a fresh issue if refresh fails (`src/services/nomba/client.ts`).

2. **The webhook signature is NOT an HMAC of the raw request body.**
   This was the biggest divergence. Nomba builds a **colon-delimited string of
   specific fields** and HMAC-SHA256s *that* (base64) with your dashboard
   signature key:
   ```
   event_type:requestId:userId:walletId:transactionId:type:time:responseCode:nomba-timestamp
   ```
   A literal `responseCode` of `"null"` is treated as empty string. The timestamp
   is the `nomba-timestamp` header. Compared case-insensitively to the
   `nomba-signature` header.
   → Implemented and verified against the docs' own example
   (secret `HkatexKDZg7CLWy96q5sfrVHSvtoz92B` →
   `Kt9095hQxfgmVbx6iz7G2tPhHdbdXgLlyY/mf35sptw=`). Verified ✅.

3. **The unique webhook id is `requestId` (camelCase), not `request_id` / `event_id`.**
   The doc's field table says `request_id` but every real example payload uses
   `requestId`. The dedupe ledger keys on `requestId`.

4. **The documented `payment_success` payload does NOT inline
   `data.tokenizedCardData.tokenKey`.**
   The original assumption was that the webhook carries
   `data.tokenizedCardData.tokenKey`. The documented `payment_success` example is
   actually a virtual-account transfer (`transaction.type = "vact_transfer"`) and
   carries no card token. The token-bearing fields seen elsewhere are on the
   transaction record (`onlineCheckoutTokenKey`, `onlineCheckoutOrderReference`,
   `onlineCheckoutCustomerEmail`).
   → The webhook handler extracts the token defensively from several possible
   paths and, if none is present, **falls back to `GET /checkout/tokenized-card-data`
   (List Tokenized Cards) by customer email** to resolve it
   (`src/services/webhook/handler.ts`). This is the one place where the exact
   live shape couldn't be 100% pinned from docs alone; the defensive extraction +
   fallback covers the documented variants.

5. **There is no dedicated "virtual-account credit" webhook event.**
   Inbound transfers (including those funding a virtual account) arrive as
   `payment_success` with `transaction.type = "vact_transfer"` and a
   `transaction.aliasAccountNumber`. → VA reconciliation matches
   `aliasAccountNumber` against the stored virtual-account number.

6. **Webhook event set** is `payment_success`, `payment_failed`,
   `payout_success`, `payout_failed`, `payment_reversal`, `payout_refund`.
   Railpoint acts on `payment_success` (activation + VA credit); `payment_failed`
   is informational (the billing engine drives card retries itself).

7. **Idempotency header** for charges is `X-Idempotent-key` (Nomba's spelling).
   Sent on every tokenized-card charge.

8. **Sandbox failure triggers** (needed to demo recovery): a charge **amount >
   500,000** is declined for insufficient funds; card `5484 4972 1831 7651`
   gives "do not honor". The mock adapter mirrors the >500,000 rule.

## Other useful facts captured

- Create-order lets you **supply your own `orderReference`**, which Railpoint
  does (a UUID) so the activation webhook can be matched back to the pending
  subscription deterministically.
- Rate limit headers (`X-Rate-Limit-*`) are returned on every call; Nomba retries
  failed webhook deliveries up to 5 times with exponential backoff — hence the
  `requestId` dedupe ledger is essential.
