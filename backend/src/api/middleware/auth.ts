import crypto from 'crypto';
import { RequestHandler } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * API-key auth for management endpoints. The merchant (business owner) sends
 * their key as `Authorization: Bearer <key>` or `x-api-key: <key>`.
 *
 * If API_KEY is not configured, auth is disabled (local dev / tests) and a
 * one-time warning is logged at startup. Webhooks and /health are never gated
 * here — webhooks are protected by Nomba's signature instead.
 */

let warned = false;
export function warnIfAuthDisabled(): void {
  if (!env.apiKey && !warned) {
    warned = true;
    logger.warn('API_KEY is not set — management endpoints are UNAUTHENTICATED. Set API_KEY in production.');
  }
}

function extractKey(header: string | undefined, xApiKey: string | undefined): string | null {
  if (xApiKey) return xApiKey;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!env.apiKey) return next(); // auth disabled

  const provided = extractKey(req.header('authorization'), req.header('x-api-key'));
  if (provided && safeEqual(provided, env.apiKey)) return next();

  return res.status(401).json({ error: 'unauthorized', hint: 'send Authorization: Bearer <API_KEY> or x-api-key' });
};
