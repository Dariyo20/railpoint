# Railpoint

Recurring membership-billing backend on the **Nomba** payment API, with a
**Smart Recovery** engine as the differentiator. Built for the Nomba x DevCareer
2026 build track. See [`Railpoint-Technical-PRD.md`](./Railpoint-Technical-PRD.md)
for the product spec — this README covers how to run it.

A membership business sets up a plan once, members pay once through Nomba
checkout (card tokenized), and Railpoint auto-charges each member every cycle.
When a charge fails (the normal Nigerian case: empty account before payday), the
Smart Recovery engine retries intelligently — payday-aware delays, partial
collection, and a virtual-account fallback — instead of giving up.

---

## Architecture

**Runs with no Redis and no Docker.** By default the billing engine is an
in-process scheduler (`setTimeout`/`setInterval`) that lives inside the API
process — one command, one process, MongoDB only.

```
                     ┌──────────────── API process ─────────────────┐
  REST + webhook ──▶ │  Express routes                              │
                     │  In-process job engine (QUEUE_DRIVER=memory):│
                     │    - billing tick (repeatable)               │
                     │    - charge-cycle + recovery-attempt jobs    │
                     └──────────────────┬───────────────────────────┘
                                        │ state
                                 MongoDB (Mongoose)

         All Nomba calls go through ONE adapter: src/services/nomba/
```

- **Default (`QUEUE_DRIVER=memory`)** — no Redis, no Docker. `npm run dev:api`
  runs the API *and* the billing engine in the same process. This is all you need
  to run and demo Railpoint.
- **Optional scale-out (`QUEUE_DRIVER=redis`)** — swaps the in-process engine for
  BullMQ on Redis so the billing engine can run as a separate long-running worker
  (`src/worker.ts`) on Render / Railway / Fly. Only then is `REDIS_URL` used. The
  billing logic is identical either way (`src/services/billing/queue/`).

### Project layout

| Path | Purpose |
|------|---------|
| `src/services/nomba/` | **The only place that talks to Nomba.** Auth (token cache + auto-refresh), `createCheckoutOrder`, `chargeToken`, `createVirtualAccount`, `listTokenizedCards`. Honours `MOCK_NOMBA`. |
| `src/services/webhook/` | Signature verification + idempotent event handler. |
| `src/services/billing/` | Job engine (in-memory default / optional Redis), billing tick, charge-cycle, Smart Recovery engine, virtual-account fallback. |
| `src/models/` | All Mongoose models from the PRD. |
| `src/api/` | Express app + routes. |

---

## Prerequisites

- Node 20+
- MongoDB (local or a free MongoDB Atlas cluster)
- **No Redis, no Docker required** in the default mode. (Redis is only needed if
  you opt into `QUEUE_DRIVER=redis`.)

## Setup

```bash
npm install
cp .env.example .env     # then edit values
```

Set `MOCK_NOMBA=true` (the default) to run the **entire system with no Nomba
credentials and no network** — the adapter returns deterministic, sandbox-like
responses so the full demo works offline. Set `MOCK_NOMBA=false` and fill in the
Nomba vars to hit the real API.

## Running

Default mode is **one process, no Redis**:

```bash
npm run dev:api      # or: npm run build && npm run start:api
```

This starts the API and the embedded billing engine together. Health check:
`GET http://localhost:4000/health` (shows `"queue":"memory"`).

<details>
<summary>Optional: Redis scale-out (two processes)</summary>

Set `QUEUE_DRIVER=redis` and `REDIS_URL=...`, then run the API and the worker
separately:

```bash
npm run dev:api      # enqueues jobs
npm run dev:worker   # long-running billing worker (Render/Railway/Fly, not serverless)
```
</details>

## Tests

```bash
npm test
```

Jest + the in-memory job engine — **no Docker, no Redis**. 39 tests across 9
suites cover the Nomba adapter + token cache/refresh, model state transitions,
webhook signature security, idempotency (double webhook, double charge), and the
full Smart Recovery arc (fail → partial → clear, and window-exhaust → virtual
account → credit).

The suite needs a MongoDB to talk to. It picks one automatically:

- If `TEST_MONGODB_URI` is set, it uses that (fastest, recommended):
  ```bash
  TEST_MONGODB_URI="mongodb+srv://.../railpoint_test" npm test
  ```
- Otherwise it spins up `mongodb-memory-server` (downloads a MongoDB binary on
  first run — still no Docker, just a one-time ~large download; slow networks
  should prefer `TEST_MONGODB_URI`).

### Seed a ready-to-demo dataset

```bash
npm run seed
```

Creates a daily plan and two **active** subscriptions (Alice = happy path, Bob =
recovery path), simulating checkout + tokenization end-to-end through the mock.
Prints the ids you need for the demo.

---

## The 60-second demo

With the app running (`npm run dev:api`) and `MOCK_NOMBA=true`,
`DEMO_FAST_RECOVERY=true`:

1. **Subscribe** (or `npm run seed`). For a manual subscribe:
   ```bash
   curl -X POST localhost:4000/plans -H 'content-type: application/json' \
     -d '{"name":"Monthly","amount":10000,"interval":"daily"}'
   curl -X POST localhost:4000/members -H 'content-type: application/json' \
     -d '{"name":"Bob","email":"bob@example.com","expectedPayday":25}'
   curl -X POST localhost:4000/subscriptions/initiate -H 'content-type: application/json' \
     -d '{"planId":"<planId>","memberId":"<memberId>"}'
   # open the returned checkoutLink (mock returns a sandbox URL)
   ```
2. **Happy path** — advance Alice's cycle and watch it charge:
   ```bash
   curl -X POST localhost:4000/demo/advance -H 'content-type: application/json' \
     -d '{"subscriptionId":"<aliceSub>"}'
   ```
3. **Recovery arc** — force Bob's charges to fail, then advance:
   ```bash
   curl -X POST localhost:4000/demo/simulate-failure -H 'content-type: application/json' \
     -d '{"subscriptionId":"<bobSub>","fullFailures":2}'
   curl -X POST localhost:4000/demo/advance -H 'content-type: application/json' \
     -d '{"subscriptionId":"<bobSub>"}'
   ```
   The initial charge fails → cycle enters `recovering` → fast retries fire
   seconds apart → a **partial** is collected (balance ticks down) → the next
   full charge clears it. Watch:
   ```bash
   curl localhost:4000/cycles?status=recovering
   curl localhost:4000/stats           # totalRecovered climbs
   curl localhost:4000/subscriptions   # live status + balances
   ```
4. **Virtual-account fallback** (optional) — if the window closes unpaid, a
   Nomba virtual account is created and the cycle goes `past_due`. To show the
   reconciliation without a real bank transfer:
   ```bash
   curl -X POST localhost:4000/demo/simulate-va-credit -H 'content-type: application/json' \
     -d '{"cycleId":"<cycleId>"}'
   ```

---

## API surface

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/plans` | Create a plan |
| GET | `/plans/:id` | Plan details |
| POST | `/members` | Add a member (optional `expectedPayday`) |
| POST | `/subscriptions/initiate` | Create Nomba checkout order, return checkout link |
| POST | `/webhooks/nomba` | Handle `payment_success` + virtual-account credit |
| POST | `/subscriptions/:id/charge` | Charge saved token now (worker + demo) |
| GET | `/subscriptions` | Dashboard list (status, next charge, balances) |
| GET | `/cycles?status=recovering` | Recovery view |
| GET | `/stats` | `{ totalRecovered }` for the live counter |
| POST | `/demo/advance` | Set a cycle's dueDate to now and fire it |
| POST | `/demo/simulate-failure` | Force the next full charge(s) to fail |
| POST | `/demo/simulate-va-credit` | (demo) Synthesize a VA inbound-transfer webhook |
| GET | `/health` | Liveness + Mongo/Redis status |

---

## The recovery state machine (cycle)

```
scheduled ──charge ok──────────────▶ paid
   │
   └─charge fail──▶ recovering ──full ok──▶ paid
                        │
                        ├─partial ok──▶ (partial, stays recovering)
                        │
                        └─window closes unpaid──▶ past_due ──VA credit──▶ paid
```

- **Soft failure** (`insufficient_funds`) → recovery: payday-aware delayed
  retries, each trying a **full** charge then a **partial** (floor) charge.
- **Hard card error** (`card_error` / `do_not_honor`) → skip retries, go straight
  to the virtual-account fallback.
- Idempotency: deterministic BullMQ `jobId`s (`charge:<cycleId>:<attempt>`,
  `recovery:<cycleId>:<attempt>`) collapse duplicates; every Charge row has a
  unique deterministic `idempotencyKey`; the `X-Idempotent-key` header is sent on
  every Nomba charge; webhooks dedupe on `requestId`.

---

## Security & hygiene

- **`tokenKey` is never logged and never returned in any API response.** It is
  stored with Mongoose `select: false`, and the Pino logger redacts `tokenKey`,
  `access_token`, `refresh_token`, `client_secret` and `authorization`
  everywhere.
- **Webhook signatures are verified** on every call (`src/services/webhook/verify.ts`)
  and unsigned/mismatched requests are rejected with 401. The implementation is
  unit-checked against Nomba's official signature test vector.
- All secrets are in env vars; nothing is committed. See `.env.example`.

---

## Nomba ground truth (verified against developer.nomba.com)

Base URL `https://api.nomba.com/v1` (sandbox `https://sandbox.nomba.com/v1`).
All calls send `Authorization: Bearer <jwt>` and an `accountId` header.

| Operation | Verified endpoint |
|-----------|-------------------|
| Obtain token | `POST /auth/token/issue` `{grant_type:"client_credentials", client_id, client_secret}` |
| Refresh token | `POST /auth/token/refresh` `{grant_type:"refresh_token", refresh_token}` |
| Create checkout order | `POST /checkout/order` `{order:{...}, tokenizeCard:true}` → `data.checkoutLink`, `data.orderReference` |
| Charge saved token | `POST /checkout/tokenized-card-payment` `{order:{...}, tokenKey}` → `{code:"00", data:{status:true}}` |
| List tokenized cards | `GET /checkout/tokenized-card-data?customerEmail=` |
| Create virtual account | `POST /accounts/virtual` `{accountRef, accountName, expectedAmount?}` |

**Where the docs differed from the original assumptions — see
[`NOMBA_NOTES.md`](./NOMBA_NOTES.md).**

### Sandbox test cards (from Nomba docs)

| Outcome | How |
|---------|-----|
| Success | card `5434 6210 7425 2808`, OTP `9999` |
| Declined ("do not honor") | card `5484 4972 1831 7651` |
| Insufficient funds | charge amount **> 500,000** |

---

## Deployment

- **Default (memory engine):** deploy the API as a single **long-running**
  service (Render / Railway / Fly) — it runs the billing engine in-process, so
  the timers stay alive. Point it at MongoDB. No Redis. (Avoid scale-to-zero
  serverless here, since the in-process tick must keep running.)
- **Redis scale-out (optional):** set `QUEUE_DRIVER=redis` + `REDIS_URL`, deploy
  the API and a separate `worker` process, both on the same MongoDB and Redis.
- Configure the Nomba dashboard webhook URL to `https://<api-host>/webhooks/nomba`
  and set the same signature key in `NOMBA_WEBHOOK_SIGNATURE_KEY`.
