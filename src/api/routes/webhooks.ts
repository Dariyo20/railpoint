import { Router } from 'express';
import { logger } from '../../config/logger';
import { asyncHandler } from '../http';
import { extractNombaHeaders, verifyWebhook } from '../../services/webhook/verify';
import { handleWebhook } from '../../services/webhook/handler';

export const webhooksRouter = Router();

/**
 * Nomba webhook receiver. Verifies the signature, then processes the event.
 * Always returns 200 quickly on a successfully-handled (or duplicate/ignored)
 * event so Nomba does not retry; returns 401 on bad signatures and 500 only on
 * unexpected processing errors (so Nomba's retry can re-deliver).
 */
webhooksRouter.post(
  '/webhooks/nomba',
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const headers = extractNombaHeaders(req.headers as Record<string, unknown>);

    const verdict = verifyWebhook(payload, headers);
    if (!verdict.ok) {
      logger.warn({ reason: verdict.reason, eventType: payload?.event_type }, 'Webhook signature rejected');
      return res.status(401).json({ error: 'invalid signature', reason: verdict.reason });
    }

    const result = await handleWebhook(payload);
    logger.info({ result, eventType: payload?.event_type }, 'Webhook processed');
    return res.status(200).json({ received: true, ...result });
  })
);
