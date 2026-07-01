import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Nomba webhook signature verification.
 *
 * IMPORTANT (ground-truth divergence): Nomba does NOT sign the raw request body.
 * It builds a colon-delimited string from specific fields and HMAC-SHA256s that
 * with your dashboard signature key, base64-encoded. We re-create the same
 * string and compare (case-insensitive, constant-time) to the `nomba-signature`
 * header. The timestamp used is the `nomba-timestamp` header value.
 *
 *   signedString =
 *     event_type:requestId:userId:walletId:transactionId:type:time:responseCode:nombaTimestamp
 *
 * A `responseCode` of the literal "null" is treated as empty string.
 */

export interface NombaWebhookHeaders {
  signature?: string; // nomba-signature
  timestamp?: string; // nomba-timestamp
  algorithm?: string; // nomba-signature-algorithm
}

export function extractNombaHeaders(headers: Record<string, unknown>): NombaWebhookHeaders {
  const get = (name: string): string | undefined => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : (v as string | undefined);
  };
  return {
    signature: get('nomba-signature') ?? get('nomba-sig-value'),
    timestamp: get('nomba-timestamp'),
    algorithm: get('nomba-signature-algorithm'),
  };
}

export function buildSignedString(payload: any, nombaTimestamp: string): string {
  const data = payload?.data ?? {};
  const merchant = data.merchant ?? {};
  const transaction = data.transaction ?? {};

  let responseCode = transaction.responseCode ?? '';
  if (responseCode === 'null') responseCode = '';

  return [
    payload?.event_type ?? '',
    payload?.requestId ?? '',
    merchant.userId ?? '',
    merchant.walletId ?? '',
    transaction.transactionId ?? '',
    transaction.type ?? '',
    transaction.time ?? '',
    responseCode,
    nombaTimestamp,
  ].join(':');
}

export function computeSignature(payload: any, nombaTimestamp: string, key: string): string {
  const signed = buildSignedString(payload, nombaTimestamp);
  return crypto.createHmac('sha256', key).update(signed).digest('base64');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyWebhook(payload: any, headers: NombaWebhookHeaders): VerifyResult {
  if (!env.nomba.verifySignature) return { ok: true, reason: 'verification_disabled' };

  if (!env.nomba.webhookSignatureKey) {
    return { ok: false, reason: 'no_signature_key_configured' };
  }
  if (!headers.signature) return { ok: false, reason: 'missing_signature_header' };
  if (!headers.timestamp) return { ok: false, reason: 'missing_timestamp_header' };

  const expected = computeSignature(payload, headers.timestamp, env.nomba.webhookSignatureKey);
  // Nomba compares case-insensitively; do the same but constant-time.
  const ok = timingSafeEqualStr(expected.toLowerCase(), headers.signature.toLowerCase());
  return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}
