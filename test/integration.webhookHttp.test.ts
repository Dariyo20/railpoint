import request from 'supertest';
import { randomUUID } from 'crypto';
import { buildApp } from '../src/api/app';
import { computeSignature } from '../src/services/webhook/verify';
import { SubscriptionModel } from '../src/models';
import { makePlan, makeMember } from './helpers';

const app = buildApp();
const KEY = process.env.NOMBA_WEBHOOK_SIGNATURE_KEY as string;

describe('POST /webhooks/nomba (HTTP security)', () => {
  it('rejects a request with no signature (401)', async () => {
    const res = await request(app).post('/webhooks/nomba').send({ event_type: 'payment_success', requestId: 'x', data: {} });
    expect(res.status).toBe(401);
  });

  it('rejects a request with a bad signature (401)', async () => {
    const res = await request(app)
      .post('/webhooks/nomba')
      .set('nomba-signature', 'wrong')
      .set('nomba-timestamp', '2026-07-01T00:00:00Z')
      .send({ event_type: 'payment_success', requestId: 'x', data: {} });
    expect(res.status).toBe(401);
  });

  it('accepts and processes a correctly-signed activation webhook (200)', async () => {
    const plan = await makePlan();
    const member = await makeMember();
    const orderReference = randomUUID();
    await SubscriptionModel.create({ planId: plan._id, memberId: member._id, orderReference, status: 'pending' });

    const ts = '2026-07-01T00:00:00Z';
    const payload = {
      event_type: 'payment_success',
      requestId: randomUUID(),
      data: {
        merchant: { userId: 'u', walletId: 'w' },
        transaction: {
          type: 'online_checkout',
          transactionId: 't1',
          time: ts,
          responseCode: '',
          onlineCheckoutOrderReference: orderReference,
          onlineCheckoutCustomerEmail: member.email,
          onlineCheckoutTokenKey: 'tok-http',
        },
      },
    };
    const sig = computeSignature(payload, ts, KEY);
    const res = await request(app)
      .post('/webhooks/nomba')
      .set('nomba-signature', sig)
      .set('nomba-timestamp', ts)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('activated');
  });

  it('never leaks tokenKey in GET /subscriptions', async () => {
    const plan = await makePlan();
    const member = await makeMember();
    await SubscriptionModel.create({ planId: plan._id, memberId: member._id, orderReference: randomUUID(), tokenKey: 'super-secret-token', status: 'active' });
    const res = await request(app).get('/subscriptions');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-token');
    expect(JSON.stringify(res.body)).not.toContain('tokenKey');
  });
});
