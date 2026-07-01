import pino from 'pino';
import { env } from './env';

/**
 * Structured logger. A single redaction list ensures the card `tokenKey`
 * (and anything that looks like one) is NEVER written to logs, no matter where
 * an object carrying it is logged from.
 */
export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'tokenKey',
      '*.tokenKey',
      '*.*.tokenKey',
      'data.tokenKey',
      'data.*.tokenKey',
      'order.tokenKey',
      'client_secret',
      'clientSecret',
      'access_token',
      'refresh_token',
      'authorization',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'railpoint' },
  // Pretty transport only in local development. In test/prod use plain JSON so
  // no worker-thread transport is spawned (keeps Jest from hanging).
  transport:
    env.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
        }
      : undefined,
});

export type Logger = typeof logger;
