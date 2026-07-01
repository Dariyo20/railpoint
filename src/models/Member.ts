import { Schema, model, InferSchemaType, Types } from 'mongoose';

const memberSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: null },
    // Optional day-of-month (1-28) that drives payday-aware retry scheduling.
    expectedPayday: { type: Number, min: 1, max: 28, default: null },
  },
  { timestamps: true }
);

export type Member = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export const MemberModel = model('Member', memberSchema);
