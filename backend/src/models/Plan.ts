import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const PLAN_INTERVALS = ['daily', 'weekly', 'monthly'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

const planSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    name: { type: String, required: true },
    // Amount in WHOLE NAIRA (e.g. 10000 = NGN 10,000.00). Nomba amounts are
    // naira decimal strings; we store the integer naira and format on the way out.
    amount: { type: Number, required: true, min: 1 },
    interval: { type: String, enum: PLAN_INTERVALS, required: true },
  },
  { timestamps: true }
);

export type Plan = InferSchemaType<typeof planSchema> & { _id: Types.ObjectId };
export const PlanModel = model('Plan', planSchema);
