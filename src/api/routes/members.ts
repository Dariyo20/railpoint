import { Router } from 'express';
import { z } from 'zod';
import { MemberModel } from '../../models';
import { asyncHandler, parseBody } from '../http';
import { defaultMerchantId } from '../../services/merchant';

export const membersRouter = Router();

const createMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  expectedPayday: z.number().int().min(1).max(28).optional(),
  merchantId: z.string().optional(),
});

membersRouter.post(
  '/members',
  asyncHandler(async (req, res) => {
    const body = parseBody(createMemberSchema, req);
    const merchantId = body.merchantId ?? (await defaultMerchantId());
    const member = await MemberModel.create({
      merchantId,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      expectedPayday: body.expectedPayday ?? null,
    });
    res.status(201).json(member);
  })
);
