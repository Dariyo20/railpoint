/**
 * Exercises the REAL Nomba HTTP path (MOCK_NOMBA=false) with a stubbed global
 * fetch: auth token cache + refresh, checkout order, and tokenized charge
 * success/decline mapping. No network.
 */

type FetchImpl = (url: string, init: any) => Promise<any>;

function jsonResponse(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface Loaded {
  nomba: typeof import('../src/services/nomba');
  client: typeof import('../src/services/nomba/client');
  calls: { url: string; init: any }[];
}

function loadFresh(fetchImpl: FetchImpl): Loaded {
  jest.resetModules();
  process.env.MOCK_NOMBA = 'false';
  process.env.NOMBA_BASE_URL = 'https://sandbox.nomba.com/v1';
  const calls: { url: string; init: any }[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return fetchImpl(url, init);
  });
  const nomba = require('../src/services/nomba') as typeof import('../src/services/nomba');
  const client = require('../src/services/nomba/client') as typeof import('../src/services/nomba/client');
  return { nomba, client, calls };
}

const TOKEN_OK = (expiresAt: string) =>
  jsonResponse(200, {
    code: '00',
    description: 'Success',
    data: { businessId: 'biz', access_token: 'jwt-abc', refresh_token: 'refresh-xyz', expiresAt },
  });

const farFuture = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const nearExpiry = () => new Date(Date.now() + 4 * 60 * 1000).toISOString(); // within 5-min skew

afterEach(() => {
  delete (global as any).fetch;
});

describe('Nomba adapter — auth token cache & refresh', () => {
  it('issues a token once and reuses it across calls (cache)', async () => {
    const { nomba, calls } = loadFresh(async (url) => {
      if (url.includes('/auth/token/issue')) return TOKEN_OK(farFuture());
      if (url.includes('/checkout/order')) return jsonResponse(200, { code: '00', description: 'ok', data: { checkoutLink: 'https://x/y', orderReference: 'ref-1' } });
      return jsonResponse(404, { code: '404', description: 'nope' });
    });

    await nomba.createCheckoutOrder({ orderReference: 'ref-1', amountNaira: 10000, customerEmail: 'a@b.com' });
    await nomba.createCheckoutOrder({ orderReference: 'ref-2', amountNaira: 10000, customerEmail: 'a@b.com' });

    const authCalls = calls.filter((c) => c.url.includes('/auth/token/issue'));
    expect(authCalls.length).toBe(1); // token cached, not re-issued
    const orderCalls = calls.filter((c) => c.url.includes('/checkout/order'));
    expect(orderCalls.length).toBe(2);
    // Bearer + accountId headers present
    expect(orderCalls[0].init.headers.Authorization).toBe('Bearer jwt-abc');
    expect(orderCalls[0].init.headers.accountId).toBe('test-account');
  });

  it('refreshes the token via /auth/token/refresh when near expiry', async () => {
    const { nomba, calls } = loadFresh(async (url) => {
      if (url.includes('/auth/token/issue')) return TOKEN_OK(nearExpiry());
      if (url.includes('/auth/token/refresh')) return TOKEN_OK(farFuture());
      if (url.includes('/checkout/order')) return jsonResponse(200, { code: '00', description: 'ok', data: { checkoutLink: 'l', orderReference: 'r' } });
      return jsonResponse(404, { code: '404', description: 'nope' });
    });

    await nomba.createCheckoutOrder({ orderReference: 'r1', amountNaira: 100, customerEmail: 'a@b.com' }); // issues (near expiry)
    await nomba.createCheckoutOrder({ orderReference: 'r2', amountNaira: 100, customerEmail: 'a@b.com' }); // triggers refresh

    expect(calls.filter((c) => c.url.includes('/auth/token/issue')).length).toBe(1);
    expect(calls.filter((c) => c.url.includes('/auth/token/refresh')).length).toBe(1);
  });
});

describe('Nomba adapter — tokenized charge', () => {
  it('returns success on code 00 + status true', async () => {
    const { nomba } = loadFresh(async (url) => {
      if (url.includes('/auth/token/issue')) return TOKEN_OK(farFuture());
      if (url.includes('/checkout/tokenized-card-payment')) return jsonResponse(200, { code: '00', description: 'Success', data: { status: true, message: 'Approved by Financial Institution' } });
      return jsonResponse(404, { code: '404', description: 'nope' });
    });
    const res = await nomba.chargeToken({ tokenKey: 'tok', amountNaira: 10000, customerEmail: 'a@b.com', orderReference: 'o', idempotencyKey: 'charge:1:1:full' });
    expect(res.success).toBe(true);
    expect(res.nombaRef).toBe('charge:1:1:full');
  });

  it('maps a decline (status false) to insufficient_funds without throwing', async () => {
    const { nomba, calls } = loadFresh(async (url) => {
      if (url.includes('/auth/token/issue')) return TOKEN_OK(farFuture());
      if (url.includes('/checkout/tokenized-card-payment')) return jsonResponse(200, { code: '51', description: 'Declined', data: { status: false, message: 'Insufficient funds' } });
      return jsonResponse(404, { code: '404', description: 'nope' });
    });
    const res = await nomba.chargeToken({ tokenKey: 'tok', amountNaira: 600000, customerEmail: 'a@b.com', orderReference: 'o', idempotencyKey: 'k1' });
    expect(res.success).toBe(false);
    expect(res.failureReason).toBe('insufficient_funds');
    // idempotency header sent to Nomba
    const chargeCall = calls.find((c) => c.url.includes('/checkout/tokenized-card-payment'));
    expect(chargeCall!.init.headers['X-Idempotent-key']).toBe('k1');
  });

  it('sends amount as a naira decimal string and includes the sub-account', async () => {
    process.env.NOMBA_SUBACCOUNT_ID = 'sub-123';
    const { nomba, calls } = loadFresh(async (url) => {
      if (url.includes('/auth/token/issue')) return TOKEN_OK(farFuture());
      if (url.includes('/checkout/tokenized-card-payment')) return jsonResponse(200, { code: '00', description: 'ok', data: { status: true, message: 'ok' } });
      return jsonResponse(404, { code: '404', description: 'nope' });
    });
    await nomba.chargeToken({ tokenKey: 'tok', amountNaira: 10000, customerEmail: 'a@b.com', orderReference: 'o', idempotencyKey: 'k2' });
    const body = JSON.parse(calls.find((c) => c.url.includes('tokenized-card-payment'))!.init.body);
    expect(body.order.amount).toBe('10000.00');
    expect(body.order.accountId).toBe('sub-123');
    expect(body.tokenKey).toBe('tok');
    delete process.env.NOMBA_SUBACCOUNT_ID;
  });
});
