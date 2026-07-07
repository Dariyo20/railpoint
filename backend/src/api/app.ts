import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from './http';
import { requireAuth, warnIfAuthDisabled } from './middleware/auth';
import { healthRouter } from './routes/health';
import { plansRouter } from './routes/plans';
import { membersRouter } from './routes/members';
import { subscriptionsRouter } from './routes/subscriptions';
import { cyclesRouter } from './routes/cycles';
import { webhooksRouter } from './routes/webhooks';
import { demoRouter } from './routes/demo';

export function buildApp() {
  warnIfAuthDisabled();
  const app = express();

  // Behind Render's proxy — needed for correct client IPs (rate limiting).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
    })
  );

  // Basic rate limit (does not apply to the webhook — Nomba can burst-retry).
  const limiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });

  // ── Public routes (no API key) ──────────────────────────────────────────
  app.use(healthRouter); // liveness
  app.use(webhooksRouter); // protected by Nomba signature, not the API key
  app.get('/checkout/return', (_req, res) => {
    res.type('html').send(
      '<h2>Payment received — you can close this tab.</h2><p>Railpoint is activating your membership.</p>'
    );
  });

  // ── Everything below requires the merchant API key (when configured) ─────
  app.use(limiter);
  app.use(requireAuth);

  app.use(plansRouter);
  app.use(membersRouter);
  app.use(subscriptionsRouter);
  app.use(cyclesRouter);

  // Demo/simulation endpoints — only mounted when explicitly enabled.
  if (env.enableDemoRoutes) {
    app.use(demoRouter);
  } else {
    logger.info('Demo routes disabled (ENABLE_DEMO_ROUTES=false)');
  }

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    logger.error({ err: (err as Error)?.message, stack: (err as Error)?.stack }, 'Unhandled API error');
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
