import { Schema, model, InferSchemaType, Types } from 'mongoose';

const merchantSchema = new Schema(
  {
    name: { type: String, required: true },
    // Optional: merchant's own card token that can backstop the bill.
    primaryCardToken: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

export type Merchant = InferSchemaType<typeof merchantSchema> & { _id: Types.ObjectId };
export const MerchantModel = model('Merchant', merchantSchema);
