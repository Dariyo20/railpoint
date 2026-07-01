import { buildSignedString, computeSignature, verifyWebhook, extractNombaHeaders } from '../src/services/webhook/verify';

// Official example from Nomba's webhook docs (GoLang/Java/C# sample).
const DOC_SECRET = 'HkatexKDZg7CLWy96q5sfrVHSvtoz92B';
const DOC_TIMESTAMP = '2025-09-29T10:51:44Z';
const DOC_EXPECTED = 'Kt9095hQxfgmVbx6iz7G2tPhHdbdXgLlyY/mf35sptw=';
const DOC_PAYLOAD = {
  event_type: 'payment_success',
  requestId: '45f2dc2d-d559-4773-bba3-2d5ec17b2e20',
  data: {
    merchant: { walletId: '6756ff80aafe04a795f18b38', userId: 'b7b10e81-e57d-41d0-8fdc-f4e23a132bbf' },
    transaction: {
      transactionId: 'API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a',
      type: 'vact_transfer',
      time: '2025-09-29T10:51:44Z',
      responseCode: '',
    },
  },
};

describe('webhook signature (verified against Nomba doc vector)', () => {
  it('builds the exact colon-delimited signed string', () => {
    expect(buildSignedString(DOC_PAYLOAD, DOC_TIMESTAMP)).toBe(
      'payment_success:45f2dc2d-d559-4773-bba3-2d5ec17b2e20:b7b10e81-e57d-41d0-8fdc-f4e23a132bbf:6756ff80aafe04a795f18b38:API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a:vact_transfer:2025-09-29T10:51:44Z::2025-09-29T10:51:44Z'
    );
  });

  it('computes the documented signature exactly', () => {
    expect(computeSignature(DOC_PAYLOAD, DOC_TIMESTAMP, DOC_SECRET)).toBe(DOC_EXPECTED);
  });

  it('treats a literal "null" responseCode as empty', () => {
    const withNull = { ...DOC_PAYLOAD, data: { ...DOC_PAYLOAD.data, transaction: { ...DOC_PAYLOAD.data.transaction, responseCode: 'null' } } };
    expect(computeSignature(withNull, DOC_TIMESTAMP, DOC_SECRET)).toBe(DOC_EXPECTED);
  });
});

describe('verifyWebhook (security)', () => {
  const key = process.env.NOMBA_WEBHOOK_SIGNATURE_KEY as string; // 'test-webhook-key' from setup
  const ts = '2026-07-01T00:00:00Z';
  const payload = {
    event_type: 'payment_success',
    requestId: 'req-1',
    data: { merchant: { userId: 'u1', walletId: 'w1' }, transaction: { transactionId: 't1', type: 'online_checkout', time: ts, responseCode: '' } },
  };

  it('accepts a correctly-signed request', () => {
    const sig = computeSignature(payload, ts, key);
    const res = verifyWebhook(payload, extractNombaHeaders({ 'nomba-signature': sig, 'nomba-timestamp': ts }));
    expect(res.ok).toBe(true);
  });

  it('rejects a bad signature', () => {
    const res = verifyWebhook(payload, extractNombaHeaders({ 'nomba-signature': 'not-the-right-sig', 'nomba-timestamp': ts }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('signature_mismatch');
  });

  it('rejects a missing signature header', () => {
    const res = verifyWebhook(payload, extractNombaHeaders({ 'nomba-timestamp': ts }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing_signature_header');
  });

  it('rejects when the payload is tampered after signing', () => {
    const sig = computeSignature(payload, ts, key);
    const tampered = { ...payload, data: { ...payload.data, transaction: { ...payload.data.transaction, transactionId: 'DIFFERENT' } } };
    const res = verifyWebhook(tampered, extractNombaHeaders({ 'nomba-signature': sig, 'nomba-timestamp': ts }));
    expect(res.ok).toBe(false);
  });
});
