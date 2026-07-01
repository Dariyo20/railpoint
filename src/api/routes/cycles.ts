import { Router } from 'express';
import { BillingCycleModel, CYCLE_STATUSES } from '../../models';
import { asyncHandler } from '../http';
import { totalRecovered } from '../../services/billing/cycleService';

export const cyclesRouter = Router();

/**
 * Recovery view for the dashboard. `GET /cycles?status=recovering` (or any
 * cycle status). Defaults to the recovering + partial + past_due set, which is
 * exactly what the recovery panel wants to show.
 */
cyclesRouter.get(
  '/cycles',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const filter: Record<string, unknown> = {};
    if (status && (CYCLE_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    } else if (!status) {
      filter.status = { $in: ['recovering', 'partial', 'past_due'] };
    } else {
      filter.status = status; // pass-through (may return empty)
    }

    const cycles = await BillingCycleModel.find(filter).sort({ updatedAt: -1 }).lean();
    res.json(
      cycles.map((c: any) => ({
        ...c,
        amountRemaining: Math.max(0, c.amountDue - c.amountCollected),
      }))
    );
  })
);

/** Live stats for the dashboard counter. */
cyclesRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ totalRecovered: await totalRecovered() });
  })
);
