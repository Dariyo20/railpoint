import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NombaEnvelope, IssueTokenResponse } from './types';

/**
 * Low-level Nomba HTTP client with an in-memory access-token cache and
 * automatic refresh. Nomba access tokens expire after ~30 minutes (verified in
 * docs), so we refresh ~5 minutes before expiry using the refresh_token, and
 * fall back to a fresh client_credentials issue if refresh fails.
 *
 * Nothing outside src/services/nomba/ should import this module.
 */

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min early

let cached: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    accountId: env.nomba.accountId,
    ...extra,
  };
}

async function issueToken(): Promise<CachedToken> {
  const res = await fetch(`${env.nomba.baseUrl}/auth/token/issue`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.nomba.clientId,
      client_secret: env.nomba.clientSecret,
    }),
  });
  return parseTokenResponse(res, 'issue');
}

async function refreshToken(refresh: string, accessToken: string): Promise<CachedToken> {
  const res = await fetch(`${env.nomba.baseUrl}/auth/token/refresh`, {
    method: 'POST',
    headers: authHeaders({ Authorization: `Bearer ${accessToken}` }),
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refresh }),
  });
  return parseTokenResponse(res, 'refresh');
}

async function parseTokenResponse(res: Response, kind: string): Promise<CachedToken> {
  const body = (await res.json().catch(() => ({}))) as NombaEnvelope<IssueTokenResponse>;
  if (!res.ok || body.code !== '00') {
    throw new Error(`Nomba auth ${kind} failed: ${res.status} ${body.description ?? ''}`.trim());
  }
  const token: CachedToken = {
    accessToken: body.data.access_token,
    refreshToken: body.data.refresh_token,
    expiresAt: new Date(body.data.expiresAt).getTime(),
  };
  logger.info({ kind, expiresAt: body.data.expiresAt }, 'Nomba access token obtained');
  return token;
}

async function getToken(): Promise<CachedToken> {
  const now = Date.now();
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > now) {
    return cached;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (cached?.refreshToken) {
        try {
          cached = await refreshToken(cached.refreshToken, cached.accessToken);
          return cached;
        } catch (err) {
          logger.warn({ err }, 'Nomba token refresh failed; re-issuing');
        }
      }
      cached = await issueToken();
      return cached;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** For tests/demo resets. */
export function clearTokenCache(): void {
  cached = null;
  inflight = null;
}

export interface NombaRequest {
  method: 'GET' | 'POST';
  path: string; // e.g. "/checkout/order"
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
}

/**
 * Make an authenticated Nomba API call. Returns the parsed envelope.
 * On a 401 it refreshes the token once and retries.
 */
export async function nombaRequest<T>(req: NombaRequest): Promise<NombaEnvelope<T>> {
  const doCall = async (token: string): Promise<Response> => {
    let url = `${env.nomba.baseUrl}${req.path}`;
    if (req.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (v !== undefined) qs.append(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    const headers = authHeaders({ Authorization: `Bearer ${token}` });
    if (req.idempotencyKey) headers['X-Idempotent-key'] = req.idempotencyKey;
    return fetch(url, {
      method: req.method,
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });
  };

  let token = (await getToken()).accessToken;
  let res = await doCall(token);

  if (res.status === 401) {
    clearTokenCache();
    token = (await getToken()).accessToken;
    res = await doCall(token);
  }

  const body = (await res.json().catch(() => ({}))) as NombaEnvelope<T>;
  if (!res.ok) {
    const e = new Error(`Nomba ${req.method} ${req.path} -> ${res.status} ${body?.description ?? ''}`.trim());
    (e as any).status = res.status;
    (e as any).body = body;
    throw e;
  }
  return body;
}
