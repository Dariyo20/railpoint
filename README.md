# Railpoint

Recurring membership-billing platform on the **Nomba** payment API, with a
**Smart Recovery** engine as the differentiator. Nomba x DevCareer 2026 build track.

This is a **monorepo**.

```
railpoint/
├── backend/                     # Node + Express + MongoDB API and billing engine (Smart Recovery)
├── frontend/                    # Next.js dashboard + subscribe/demo UI (to be added)
└── Railpoint-Technical-PRD.md   # Product spec / source of truth
```

## Packages

| Path | What it is | Status |
|------|------------|--------|
| [`backend/`](backend/) | The API, Nomba integration, BullMQ-or-in-memory billing engine, and the Smart Recovery layer. Runs with **no Redis and no Docker** by default. | ✅ built & tested (39 tests) |
| `frontend/` | Merchant dashboard, member subscribe/success pages, demo controls, live "total recovered" counter. | ⏳ planned |

## Quick start (backend)

```bash
cd backend
npm install
cp .env.example .env     # then edit values
npm run dev:api          # API + in-process billing engine (no Redis, no Docker)
npm test                 # 39 tests, 9 suites
```

See [`backend/README.md`](backend/README.md) for the full run guide, the 60-second
demo script, the API surface, and [`backend/NOMBA_NOTES.md`](backend/NOMBA_NOTES.md)
for the verified Nomba API ground truth. Submission readiness is tracked in
[`backend/READINESS_CHECKLIST.md`](backend/READINESS_CHECKLIST.md).
