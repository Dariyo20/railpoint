import request from 'supertest';
import { env } from '../src/config/env';
import { buildApp } from '../src/api/app';

// requireAuth reads env.apiKey at request time, so mutating it here takes effect
// even though the app was built once at module load.
const app = buildApp();

describe('API-key auth on management endpoints', () => {
  beforeAll(() => {
    env.apiKey = 'test-secret-key';
  });
  afterAll(() => {
    env.apiKey = '';
  });

  it('rejects a management request with no key (401)', async () => {
    const res = await request(app)
      .post('/plans')
      .send({ name: 'M', amount: 1000, interval: 'daily' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects a wrong key (401)', async () => {
    const res = await request(app).get('/subscriptions').set('x-api-key', 'nope');
    expect(res.status).toBe(401);
  });

  it('accepts a valid Bearer key (201)', async () => {
    const res = await request(app)
      .post('/plans')
      .set('Authorization', 'Bearer test-secret-key')
      .send({ name: 'M', amount: 1000, interval: 'daily' });
    expect(res.status).toBe(201);
  });

  it('accepts a valid x-api-key header (200)', async () => {
    const res = await request(app).get('/subscriptions').set('x-api-key', 'test-secret-key');
    expect(res.status).toBe(200);
  });

  it('keeps /health public', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
  });

  it('does not apply API-key auth to the webhook (uses signature instead)', async () => {
    const res = await request(app)
      .post('/webhooks/nomba')
      .send({ event_type: 'payment_success', requestId: 'x', data: {} });
    // Rejected by the webhook SIGNATURE check (has a reason), not the API-key gate.
    expect(res.status).toBe(401);
    expect(res.body.reason).toBeDefined();
  });
});
