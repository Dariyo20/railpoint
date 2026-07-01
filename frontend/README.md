# frontend (planned)

Next.js dashboard for Railpoint — merchant dashboard, member subscribe + success
pages, demo control buttons, and the live "total recovered" counter.

It builds against the backend API in [`../backend`](../backend):

- `GET /subscriptions` — dashboard list (status, next charge, balances)
- `GET /cycles?status=recovering` — recovery view
- `GET /stats` — `{ totalRecovered }` for the live counter
- `POST /subscriptions/initiate` — subscribe (returns Nomba checkout link)
- `POST /demo/advance`, `POST /demo/simulate-failure` — demo controls

Not built yet.
