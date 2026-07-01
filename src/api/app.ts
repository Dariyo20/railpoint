import express, { NextFunction, Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger';
import { ApiError } from './http';
import { healthRouter } from './routes/health';
import { plansRouter } from './routes/plans';
import { membersRouter } from './routes/members';
import { subscriptionsRouter } from './routes/subscriptions';
import { cyclesRouter } from './routes/cycles';
import { webhooksRouter } from './routes/webhooks';
import { demoRouter } from './routes/demo';

export function buildApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      // Redaction is configured on the base logger; do not log bodies.
      autoLogging: { ignore: (req) => req.url === '/health' },
    })
  );

  app.use(healthRouter);
  app.use(plansRouter);
  app.use(membersRouter);
  app.use(subscriptionsRouter);
  app.use(cyclesRouter);
  app.use(webhooksRouter);
  app.use(demoRouter);

  // Simple post-checkout landing page (Nomba callbackUrl points here).
  app.get('/checkout/return', (_req, res) => {
    res.type('html').send(
      '<h2>Payment received — you can close this tab.</h2><p>Railpoint is activating your membership.</p>'
    );
  });

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
