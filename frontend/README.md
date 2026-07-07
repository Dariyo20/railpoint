# Railpoint Frontend

Demo-first Next.js frontend for Railpoint, the recurring billing product built
for the Nomba x DevCareer hackathon Build Track.

The frontend is designed around the current backend only. It focuses on the
merchant demo flow judges need to see:

- create a plan,
- share a subscribe link,
- initiate checkout for a member,
- watch recurring state in the dashboard,
- trigger and observe unhappy-path recovery through the demo controls.

## What is implemented

- Landing page with Railpoint branding and demo framing.
- Merchant plan creation flow at `/plans/new`.
- Public member subscribe flow at `/subscribe/[planId]`.
- Merchant dashboard at `/dashboard`.
- Live dashboard reads from `GET /subscriptions`, `GET /cycles`, and `GET /stats`.
- Demo controls for activation, cycle advance, simulated failure, and virtual-account credit.

## Backend dependency

This app talks to the backend through a local Next.js proxy route at
`/api/backend/[...path]`.

That proxy exists because the current Express backend does not expose CORS for a
browser app running on a different origin. By default, the proxy forwards to:

```bash
http://127.0.0.1:4000
```

Override it with:

```bash
RAILPOINT_API_BASE_URL=http://localhost:4000
```

## Running locally

Start the backend first from the monorepo root:

```bash
cd backend
npm install
npm run dev:api
```

Then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo flow

1. Create a plan from `/plans/new`.
2. Open the generated subscribe link.
3. Submit member details and start checkout.
4. Keep `/dashboard` open in another tab.
5. Use the demo controls to activate a pending subscription if needed.
6. Trigger `Run next cycle now`.
7. Force a failure and show recovery progress in the recovery panel.
8. If a virtual account is created, simulate settlement from the dashboard.

## Current limitations

These are intentionally out of scope for this frontend pass because the backend
does not support them yet:

- customer login or self-serve billing portal,
- pause or cancel subscription controls,
- expired-card update flow,
- plan browsing and plan management,
- frontend-owned post-checkout callback handling.
