# Railpoint — Submission Readiness Checklist

Run: `TEST_MONGODB_URI="mongodb+srv://.../railpoint_test" npm test`
Result: **9 suites, 39 tests — all passing.** No Docker, no Redis.

---

## PRD §16 — Definition of Done → passing test

| # | Definition of Done | Backed by | Status |
|---|--------------------|-----------|--------|
| 1 | A member subscribes and pays once; **the token is saved** | `integration.webhook.test.ts › activates a pending subscription, saves the token, and creates the first cycle`; `integration.webhookHttp.test.ts › accepts and processes a correctly-signed activation webhook`. Also verified live against MongoDB Atlas. | ✅ |
| 2 | The cycle advances and the saved card is **auto-charged successfully** | `integration.chargeCycle.test.ts › charges a scheduled cycle, marks it paid, advances the subscription and opens the next cycle` | ✅ |
| 3 | A second member's charge **fails, recovery fires, a partial is collected, then the balance clears** | `integration.recovery.test.ts › collects a partial on attempt 2, then clears the balance on attempt 3`; `› does partial -> partial -> clear across multiple attempts`; `› window exhausted -> virtual-account fallback -> VA credit clears it` | ✅ |
| 4 | The dashboard shows **live status and a climbing "total recovered" figure** | `totalRecovered()` asserted `=== 10000` after recovery; data endpoints `GET /subscriptions`, `GET /cycles?status=recovering`, `GET /stats`. (Dashboard UI itself is frontend, out of backend scope.) | ✅ (backend data) |

---

## PRD §14 — Testing checklist

| Item | How it's covered | Status |
|------|------------------|--------|
| Sandbox test cards / **decline trigger** | Located in Nomba docs: **insufficient-funds = charge amount > 500,000** (not a card); "do not honor" decline card `5484 4972 1831 7651`; success card `5434 6210 7425 2808` + OTP `9999`. Encoded in the mock and in `src/scripts/smokeSandbox.ts`. | ✅ located |
| Live sandbox smoke test | `npm run smoke:sandbox` — creates a real checkout order, then (with a captured `SMOKE_TOKEN_KEY`) charges 600,000 (expect decline) and 10,000 (expect success). **Could not be executed from this build machine** — `sandbox.nomba.com` does not resolve on this network. Live auth *was* verified against `api.nomba.com` (`code:"00"`). Run the script from your network. | ⚠️ script ready, run on your network |
| Webhook delivery via tunnel | Documented (ngrok/cloudflared → `/webhooks/nomba`) in README. | ✅ documented |
| **Idempotency — double webhook** | `integration.webhook.test.ts › does NOT double-activate on redelivery (dedupe on requestId)`; `integration.recovery.test.ts › is idempotent on a redelivered VA credit` | ✅ |
| **Idempotency — double charge job** | `integration.chargeCycle.test.ts › does NOT double-charge when the same charge-cycle job runs twice` | ✅ |
| Webhook signature security | `unit.webhookVerify.test.ts` (matches Nomba's official vector; rejects bad/missing/tampered); `integration.webhookHttp.test.ts` (401 on bad/missing signature over HTTP) | ✅ |
| Full recovery arc end-to-end | `integration.recovery.test.ts` (whole suite) | ✅ |

---

## Test suites (all green)

| Suite | Covers |
|-------|--------|
| `unit.failureMap.test.ts` | Nomba failure-reason mapping (soft vs hard), naira (not kobo) amount formatting |
| `unit.webhookVerify.test.ts` | Signature construction/verification vs Nomba's doc vector; bad/missing/tampered rejection |
| `unit.recoverySchedule.test.ts` | Payday-aware scheduling; no collapse when payday is outside the window |
| `unit.nombaAdapter.test.ts` | Real HTTP path (mocked fetch): token cache reuse, refresh-on-expiry, charge success/decline mapping, sub-account + naira string |
| `integration.models.test.ts` | `intervalMs`, `createFirstCycle`, `applyCollection` (partial→paid), `createNextCycle` |
| `integration.chargeCycle.test.ts` | Happy-path charge, double-charge idempotency, soft-failure → recovery |
| `integration.webhook.test.ts` | Activation, dedupe ledger, token fallback via List Tokenized Cards |
| `integration.webhookHttp.test.ts` | HTTP signature 401s, signed 200, **tokenKey never leaks in `GET /subscriptions`** |
| `integration.recovery.test.ts` | Full arc: fail → partial → clear; partial→partial→clear; window-exhaust → VA → credit; VA idempotency |

---

## Flags / not-yet-demo-ready

1. **Live sandbox charge not run from this machine.** `sandbox.nomba.com` doesn't
   resolve on this network. The smoke script is ready; run it where sandbox is
   reachable. Live auth is confirmed working against production. **This is the one
   thing to verify on your own network before the demo** (per PRD §15 risk: "find
   the decline test card on day one" — trigger is amount > 500,000).
2. **Frontend dashboard is out of scope here** (backend build). The data it needs
   is served by `/subscriptions`, `/cycles`, and `/stats`.
3. **Redis path is optional and not load-tested** — the default in-memory engine
   is what the tests exercise; the Redis engine is a thin BullMQ wrapper behind
   the same interface.
4. **`NOMBA_WEBHOOK_SIGNATURE_KEY` must be set** (and `WEBHOOK_VERIFY_SIGNATURE=true`)
   once you register your webhook URL, or signed webhooks are rejected by design.
