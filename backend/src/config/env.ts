import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

function float(name: string, fallback: number): number {
  return int(name, fallback);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int('PORT', 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // On Render, RENDER_EXTERNAL_URL is injected automatically, so the Nomba
  // callbackUrl is correct with no manual config.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000',

  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/railpoint'),

  // ── Security ──────────────────────────────────────────────────────────────
  // Merchant API key. When set, all management endpoints require it
  // (Authorization: Bearer <key> or x-api-key). When BLANK, auth is disabled
  // (local dev / tests) and a startup warning is logged.
  apiKey: process.env.API_KEY ?? '',
  // Encrypts the card tokenKey at rest (AES-256-GCM). When blank, tokens are
  // stored as-is (dev). Any string works — it is hashed to a 32-byte key.
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  // Comma-separated allowed CORS origins for the dashboard. '*' allows all.
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  // Demo/simulation endpoints (/demo/*). Keep ON for the graded demo; turn OFF
  // in a real production deployment (they can activate without payment).
  enableDemoRoutes: bool('ENABLE_DEMO_ROUTES', true),

  // Job engine. Default 'memory' = in-process, NO Redis required. Set 'redis'
  // (with a real REDIS_URL) only to scale out to multiple worker processes.
  queueDriver: (process.env.QUEUE_DRIVER ?? 'memory').toLowerCase() === 'redis' ? 'redis' : 'memory',
  redisUrl: process.env.REDIS_URL ?? '',

  nomba: {
    mock: bool('MOCK_NOMBA', true),
    baseUrl: process.env.NOMBA_BASE_URL ?? 'https://sandbox.nomba.com/v1',
    // Parent accountId — goes in the `accountId` header on every call.
    accountId: process.env.NOMBA_ACCOUNT_ID ?? '',
    // Sub-account that collections are scoped to. When set, it is sent as
    // `order.accountId` so funds settle into the sub-account.
    subAccountId: process.env.NOMBA_SUBACCOUNT_ID ?? '',
    clientId: process.env.NOMBA_CLIENT_ID ?? '',
    clientSecret: process.env.NOMBA_CLIENT_SECRET ?? '',
    webhookSignatureKey: process.env.NOMBA_WEBHOOK_SIGNATURE_KEY ?? '',
    verifySignature: bool('WEBHOOK_VERIFY_SIGNATURE', true),
  },

  billing: {
    tickMs: int('BILLING_TICK_MS', 60_000),
    recoveryWindowDays: int('RECOVERY_WINDOW_DAYS', 10),
    maxRecoveryAttempts: int('MAX_RECOVERY_ATTEMPTS', 4),
    partialChargeFraction: float('PARTIAL_CHARGE_FRACTION', 0.5),
    defaultPayday: int('DEFAULT_PAYDAY', 25),
    demoFastRecovery: bool('DEMO_FAST_RECOVERY', true),
  },

  currency: 'NGN' as const,
};

export type Env = typeof env;
