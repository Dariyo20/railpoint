# Railpoint — Technical PRD & Build Plan

**Nomba x DevCareer 2026 · Build Track: Checkout + Recurring**
**Submission deadline:** 18 July 2026
**Scope:** Recurring membership billing for gyms and membership businesses, with a Smart Recovery layer as the differentiator.

---

## 1. What we are building

A backend-driven platform where a membership business sets up a plan once, members pay once through Nomba checkout (card tokenized), and the system auto-charges each member every cycle. When a charge fails (the normal Nigerian case: empty account before payday), a Smart Recovery engine retries intelligently, collects partial amounts, and falls back to a Nomba virtual account instead of giving up.

The build has three pillars:

1. **The recurring engine** — tokenize, store, auto-charge on schedule.
2. **The Smart Recovery layer** — the differentiator. Payday-aware retries, partial collection, virtual-account fallback.
3. **The demo surface** — dashboards plus a "run next cycle now" control that makes the whole loop visible in 60 seconds.

The hard rule for the whole sprint: **if it does not serve the live auto-charge-and-recover demo, it does not get built.**

---

## 2. Architecture overview

```
                    ┌─────────────────────────┐
                    │   Next.js frontend       │
                    │  - Merchant dashboard    │
                    │  - Member subscribe page │
                    │  - Demo controls         │
                    └───────────┬─────────────┘
                                │ REST
                    ┌───────────▼─────────────┐
                    │   Express API server     │
                    │  - Plans / Members       │
                    │  - Subscriptions         │
                    │  - Nomba webhook handler │
                    │  - Demo endpoints        │
                    └───┬───────────────┬─────┘
                        │               │
            ┌───────────▼──┐      ┌─────▼──────────────┐
            │  MongoDB     │      │  BullMQ + Upstash  │
            │  (state)     │      │  (billing engine)  │
            └──────────────┘      └─────┬──────────────┘
                                        │ jobs
                                  ┌─────▼──────────────┐
                                  │  Nomba API         │
                                  │  - Checkout order  │
                                  │  - Token charge    │
                                  │  - Virtual account │
                                  └────────────────────┘
```

**Data flow, happy path:**
member subscribes → API creates Nomba checkout order with tokenization → member pays → Nomba fires `payment_success` webhook → API saves `tokenKey`, creates the subscription and first billing cycle → scheduler charges the token each cycle.

**Data flow, recovery path:**
scheduled charge fails → cycle enters recovery → BullMQ schedules delayed retry jobs → each retry tries full then partial → if window exhausts, generate a Nomba virtual account and send a payment request → cycle resolves when the outstanding hits zero.

---

## 3. Tech stack

Reuse the SchoolOga stack. The advantage is not learning anything new except Nomba's API surface.

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 14 | Known, fast to ship dashboards |
| Backend | Express | Known, full control over webhook + charge logic |
| Database | MongoDB | Known, flexible schema for cycles/attempts |
| Queue / scheduler | BullMQ + Upstash Redis | Already proven for repeatable jobs; delayed jobs are exactly what recovery needs |
| Payments | Nomba API | Required by the hackathon |
| Hosting | Vercel (frontend) + Render/Railway (worker + API) | Worker must be a long-running process, not serverless |

**Important:** the BullMQ worker cannot run on Vercel serverless. The API can, but the worker needs a persistent host (Render, Railway, Fly). Decide this in Week 1.

---

## 4. Data models

### Merchant
```
{
  _id,
  name,              // "FitHub Lagos"
  primaryCardToken,  // optional: merchant's own card that backstops the bill
  createdAt
}
```
For the demo, one hardcoded merchant is enough. Do not build merchant signup.

### Plan
```
{
  _id,
  merchantId,
  name,              // "Monthly Membership"
  amount,            // 10000 (in Naira, store as integer kobo if Nomba expects kobo — verify)
  interval,          // "daily" | "weekly" | "monthly"  (daily/weekly used for testing)
  createdAt
}
```

### Member
```
{
  _id,
  merchantId,
  name,
  email,
  phone,
  expectedPayday,    // optional int 1-28; drives payday-aware retry. Default: month-end window
  createdAt
}
```

### Subscription
```
{
  _id,
  planId,
  memberId,
  tokenKey,          // from Nomba payment_success webhook. NEVER logged.
  status,            // "pending" | "active" | "in_recovery" | "past_due" | "cancelled"
  nextChargeDate,
  createdAt
}
```

### BillingCycle
The unit of "what is owed this period". Makes partial collection clean.
```
{
  _id,
  subscriptionId,
  periodStart,
  periodEnd,
  dueDate,
  amountDue,         // e.g. 10000
  amountCollected,   // accumulates across attempts and partials
  status,            // "scheduled" | "paid" | "partial" | "recovering" | "past_due"
  recoveryDeadline,  // dueDate + recovery window (e.g. 10 days)
  createdAt
}
```

### Charge
```
{
  _id,
  cycleId,
  subscriptionId,
  amountAttempted,
  amountCharged,     // equals attempted on success; 0 on fail
  type,              // "full" | "partial"
  method,            // "card" | "virtual_account"
  status,            // "success" | "failed"
  failureReason,     // "insufficient_funds" | "card_error" | ...
  nombaRef,
  idempotencyKey,    // deterministic; prevents double charge
  attemptedAt
}
```

### RecoveryAttempt
```
{
  _id,
  cycleId,
  attemptNumber,
  scheduledFor,
  strategy,          // "card_full" | "card_partial" | "virtual_account"
  amountTarget,
  result,            // "success" | "partial" | "failed" | "pending"
  chargeId,          // links to the Charge created
  createdAt
}
```

### WebhookEvent (idempotency ledger)
```
{
  _id,
  nombaEventId,      // unique; reject duplicates
  type,
  payload,
  processedAt
}
```

---

## 5. Nomba integration

**Verify everything in this section against developer.nomba.com before wiring. Do not build deep logic on assumed field names.** The shapes below are the expected pattern; confirm exact paths, headers, and field names first.

### 5.1 Auth
Expect a Bearer access token plus an account/client identifier header. Nomba typically issues credentials you exchange for an access token. Confirm:
- Token endpoint and lifetime (refresh strategy if short-lived)
- Required headers on every call (e.g. `Authorization`, `accountId`)

Store credentials in env vars. Never commit them.

### 5.2 Create checkout order (with tokenization)
On `POST /subscriptions/initiate`, create a Nomba checkout order with tokenization enabled.

Expected request shape (verify):
```
POST {nomba}/checkout/order
{
  "order": {
    "amount": 10000,
    "currency": "NGN",
    "customerEmail": "member@email.com",
    "callbackUrl": "https://app/return",
    "tokenizeCard": true
  }
}
```
Returns a `checkoutLink` (redirect the member there) and an order reference. Persist the order reference against a pending subscription so the webhook can be matched back.

### 5.3 Webhook: payment_success
Nomba calls your webhook after payment. Expected payload (verify):
```
{
  "event": "payment_success",
  "data": {
    "orderReference": "...",
    "tokenizedCardData": {
      "tokenKey": "...",      // THIS is what we store
      "cardLast4": "...",
      "expiry": "..."
    }
  }
}
```
Handler steps:
1. Verify signature (see 7.1).
2. Check `WebhookEvent` for the event id. If seen, return 200 and stop.
3. Match `orderReference` to the pending subscription.
4. Save `tokenKey`, set subscription `active`, create the first `BillingCycle`, set `nextChargeDate`.
5. Record the `WebhookEvent`.
6. Return 200 fast. Do heavy work async if needed.

### 5.4 Charge a saved token
The core recurring call. Used by both the scheduler and the demo button.

Expected request shape (verify):
```
POST {nomba}/checkout/token-charge
{
  "tokenKey": "...",
  "amount": 10000,
  "currency": "NGN",
  "idempotencyKey": "charge:<cycleId>:<attemptNumber>"
}
```
Returns success/failure plus a transaction ref. Map the failure reason (insufficient funds vs card error) because recovery behaves differently per reason.

### 5.5 Virtual account fallback
When card recovery is exhausted, create a Nomba virtual account (or dedicated/dynamic account) for the outstanding amount and send the member a payment request. Reconcile via the virtual-account credit webhook. Confirm:
- Endpoint to create a virtual account
- The webhook event for an inbound transfer so you can mark the cycle paid

This is the part that bridges two Nomba products. It is also the most likely to be cut for time, see Section 11.

---

## 6. API surface

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/plans` | Create a plan |
| GET | `/plans/:id` | Plan details for subscribe page |
| POST | `/members` | Add a member (optionally with expectedPayday) |
| POST | `/subscriptions/initiate` | Create Nomba checkout order, return checkout link |
| POST | `/webhooks/nomba` | Handle payment_success and virtual-account credit events |
| POST | `/subscriptions/:id/charge` | Charge saved token now (used by worker + demo) |
| GET | `/subscriptions` | List for dashboard (status, next charge, balances) |
| GET | `/cycles?status=recovering` | Recovery view for the dashboard |
| POST | `/demo/advance` | Set a cycle's dueDate to now and trigger the tick (demo only) |
| POST | `/demo/simulate-failure` | Force the next charge to fail, to show recovery live (demo only) |

---

## 7. Security

### 7.1 Webhook signature verification
Nomba signs webhooks. Verify the signature on every call before trusting the body. Reject unsigned or mismatched requests. Confirm the exact header and signing scheme in their docs. This is non-negotiable: an unverified webhook handler is an open door to fake "payment_success" events.

### 7.2 Token handling
- `tokenKey` is the keys to a member's card. Never log it. Never return it in any API response.
- Encrypt at rest if time allows; at minimum keep it out of all logs and error traces.

### 7.3 Idempotency
- Charges: deterministic `idempotencyKey` per cycle+attempt so a retried job never double-charges.
- Webhooks: the `WebhookEvent` ledger rejects duplicate deliveries (Nomba may deliver the same event more than once).

### 7.4 Secrets
All Nomba credentials, Redis URL, and Mongo URI in env vars. Nothing committed. Use a `.env.example` for the team.

---

## 8. The billing engine (BullMQ)

### 8.1 Daily tick (repeatable job)
A repeatable job runs on a schedule (hourly during the build so you can test fast; daily in concept).

```
billing-tick:
  find BillingCycles where status = "scheduled" and dueDate <= now
  for each → enqueue charge-cycle job (jobId = "charge:<cycleId>:1")
```

### 8.2 charge-cycle job
```
charge-cycle(cycleId, attemptNumber):
  load cycle + subscription
  remaining = cycle.amountDue - cycle.amountCollected
  attempt token-charge(tokenKey, remaining, idempotencyKey)
  on success:
     create Charge(success), cycle.amountCollected += remaining
     cycle.status = "paid"
     advance subscription.nextChargeDate, create next BillingCycle
     subscription.status = "active"
  on failure (insufficient_funds):
     create Charge(failed)
     cycle.status = "recovering"
     subscription.status = "in_recovery"
     enqueue recovery (Section 9)
  on failure (hard card error):
     mark cycle "past_due", notify, skip to virtual-account fallback
```

Use deterministic `jobId`s so duplicates collapse. Keep each job small and idempotent.

---

## 9. Smart Recovery engine (the differentiator)

This is what no other team will build. Design it deliberately.

### 9.1 Principle
A failed charge in Nigeria usually means "no money yet," not "won't pay." So do not hammer. Wait for money to arrive, then collect, in full or in part.

### 9.2 Recovery schedule
On entering recovery for a cycle, schedule a small series of delayed BullMQ jobs across the recovery window (e.g. 10 days from due date):

- **Attempt 2:** payday-aware. If `member.expectedPayday` is set, schedule for that date. Else default to the month-end/early-month window (Nigerian salary reality: 25th to 5th).
- **Attempt 3:** +2 days after attempt 2.
- **Attempt 4:** +2 days after attempt 3.

Cap at a small number of attempts. Three to four is plenty and reads as "smart," not "harassing."

### 9.3 Full-then-partial logic
Each recovery attempt:
```
remaining = amountDue - amountCollected
1. try card charge for `remaining` (full)
   success → cycle paid, exit recovery
2. if full fails, try a partial charge for a floor amount
   (e.g. 50% of remaining, or a configurable minimum)
   partial success → amountCollected += partial, cycle.status = "partial",
                     stay in recovery for the rest
3. if partial also fails → log, wait for next scheduled attempt
```
Partial collection is the move that recovers something instead of nothing. It is also visually powerful in the demo (the balance ticks down across attempts).

### 9.4 Virtual-account fallback
If the recovery window closes with `amountCollected < amountDue`:
```
create Nomba virtual account for the outstanding
send member a payment request (the account number to transfer to)
cycle.status = "past_due", subscription.status = "past_due"
on virtual-account credit webhook → amountCollected += credit
   if cleared → cycle "paid", subscription "active"
```

### 9.5 Recovery state machine (cycle)
```
scheduled ──charge ok──────────────► paid
   │
   └─charge fail──► recovering ──full ok──► paid
                        │
                        ├─partial ok──► (partial, stays recovering)
                        │
                        └─window closes unpaid──► past_due ──VA credit──► paid
```

---

## 10. Demo mode

The demo is graded. Build the controls that make a slow monthly cycle visible in seconds.

- **`POST /demo/advance`** — set a chosen cycle's `dueDate` to now and fire the tick. Judges watch the auto-charge happen.
- **`POST /demo/simulate-failure`** — force the next charge to fail (mock the Nomba response or flag the member) so you can show the recovery arc live: fail → retry → partial → recovered.
- **Dashboard live counter** — a visible "total recovered" number that climbs during the demo. This quantifies your value on screen.

Demo script arc: subscribe one member → advance cycle, watch charge succeed → simulate a failure on a second member → watch smart retry collect partial, then full → recovered counter climbs. Nobody touches anything but the demo buttons.

---

## 11. Scope control

### Must build (MVP)
Plans, members, subscribe-via-Nomba-with-tokenization, webhook token capture, scheduled auto-charge, recovery with payday-aware retry and partial collection, merchant dashboard, demo controls.

### Build only if Week 2 finishes early
Virtual-account fallback (real reconciliation). If time is tight, **mock this for the demo**: show the "fallback to virtual account" step in the UI and narrate it, without wiring the live VA reconciliation. The judges need to see the concept; a mocked fallback in a demo is acceptable when the card recovery is real.

### Do not build
Auth/merchant signup, multi-currency, plan editing, cancellation/refunds, real email/SMS (dashboard flags instead), analytics beyond the recovered counter, multi-merchant onboarding.

---

## 12. Build sequence (work backward from 18 July)

Today is end of June. You have roughly 2.5 weeks, and Qwen lands 9 July in the middle of it. Front-load the integration so nothing critical is left for the final days.

### Week 1 (now → ~6 July): the spine
- Decide worker hosting (persistent process, not serverless).
- **Verify all Nomba shapes against live docs.** Auth, checkout order, webhook, token charge, virtual account.
- Stand up models, `/plans`, `/members`, `/subscriptions/initiate`.
- Get one real member through checkout with tokenization.
- Webhook handler saving a real `tokenKey`. **Milestone: one token saved from a real payment.**

### Week 2 (~7 → 13 July): the loop and recovery
- `charge-cycle` job charging a saved token successfully end to end.
- BullMQ repeatable tick + delayed recovery jobs.
- Full-then-partial recovery logic. Payday-aware scheduling.
- Dashboard reading real subscriptions, cycles, balances.
- **Milestone: a charge can fail, recover partially, then clear, all automatically.**

### Week 3 (~14 → 18 July): make it undeniable
- Demo controls (`/demo/advance`, `/demo/simulate-failure`, recovered counter).
- Polish the three screens.
- Full dry runs of the demo, repeatedly, until it is boring.
- Record the demo video with time to redo it. Write the submission. **Ship early, not on the 18th at 11pm.**

Target a working end-to-end loop by end of Week 2. Week 3 is for landing it, not finishing it.

---

## 13. Team split

- **Backend / payments / engine (Dave):** Nomba integration, webhook, charge job, the full recovery engine, demo endpoints. The spine and the differentiator.
- **Frontend:** merchant dashboard, member subscribe + success pages, the recovered counter, demo control buttons.
- **Demo + pitch owner:** demo script, video, written submission, objection prep. Owns the 3-minute story from day one, not the night before.

Roles run in parallel so the frontend and pitch are not blocked waiting on the webhook. Frontend can build against mock data while the integration lands.

---

## 14. Testing (sandbox)

- Use Nomba's test/sandbox credentials and test cards. Confirm which test card simulates a **declined / insufficient-funds** result, because your entire differentiator depends on triggering a failed charge on demand.
- Test webhook delivery locally with a tunnel (ngrok/cloudflared) pointed at `/webhooks/nomba`.
- Test idempotency: deliver the same webhook twice, fire the same charge job twice, confirm no double activation and no double charge.
- Test the full recovery arc end to end before building any demo polish.

---

## 15. Critical-path risks

| Risk | Mitigation |
|------|-----------|
| Nomba API shapes differ from assumptions | Verify in Week 1 before deep wiring. This is the single highest-leverage hour of the project. |
| Can't trigger a failed charge in sandbox | Find the decline test card on day one. No failure = no recovery demo = no differentiator. |
| Worker can't run on serverless | Pick a persistent host in Week 1. |
| Virtual-account reconciliation eats Week 3 | Mock it in the demo if card recovery is solid. Don't let it sink the build. |
| Token charge untested until late | Get one real token charge working in Week 2, not Week 3. |
| Qwen (9 July) collides with Week 2 | Protect Week 2. The loop + recovery is the part that cannot slip. |

---

## 16. Definition of done

The build is demo-ready when, with no human action beyond pressing demo buttons:

1. A member subscribes and pays once; the token is saved.
2. The cycle advances and the saved card is auto-charged successfully.
3. A second member's charge fails, recovery fires, a partial is collected, then the balance clears.
4. The dashboard shows live status and a climbing "total recovered" figure.

If those four things happen on screen, you have a winning demo. Everything else is decoration.
