import { Router } from 'express';
import { z } from 'zod';
import { PlanModel, PLAN_INTERVALS } from '../../models';
import { asyncHandler, ApiError, parseBody } from '../http';
import { defaultMerchantId } from '../../services/merchant';

export const plansRouter = Router();

const createPlanSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().positive(),
  interval: z.enum(PLAN_INTERVALS),
  merchantId: z.string().optional(),
});

plansRouter.post(
  '/plans',
  asyncHandler(async (req, res) => {
    const body = parseBody(createPlanSchema, req);
    const merchantId = body.merchantId ?? (await defaultMerchantId());
    const plan = await PlanModel.create({
      merchantId,
      name: body.name,
      amount: body.amount,
      interval: body.interval,
    });
    res.status(201).json(plan);
  })
);

plansRouter.get(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const plan = await PlanModel.findById(req.params.id);
    if (!plan) throw new ApiError(404, 'Plan not found');
    res.json(plan);
  })
);
