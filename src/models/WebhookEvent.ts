import { Schema, model, InferSchemaType, Types } from 'mongoose';

/**
 * Idempotency ledger. Nomba may deliver the same event more than once
 * (and retries failed deliveries up to 5 times). We key on the `requestId`
 * from the payload so a duplicate delivery is rejected before any side effects.
 */
const webhookEventSchema = new Schema(
  {
    nombaEventId: { type: String, required: true, unique: true }, // payload.requestId
    type: { type: String, required: true }, // payload.event_type
    payload: { type: Schema.Types.Mixed, required: true },
    processedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export type WebhookEvent = InferSchemaType<typeof webhookEventSchema> & { _id: Types.ObjectId };
export const WebhookEventModel = model('WebhookEvent', webhookEventSchema);
