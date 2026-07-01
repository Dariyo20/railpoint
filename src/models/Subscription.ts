import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const SUBSCRIPTION_STATUSES = [
  'pending',
  'active',
  'in_recovery',
  'past_due',
  'cancelled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const subscriptionSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },

    // The order reference we send to Nomba at checkout, used to match the
    // payment_success webhook back to this pending subscription.
    orderReference: { type: String, default: null, index: true },

    // The card token from Nomba. NEVER logged, NEVER returned in API responses.
    // `select: false` keeps it out of query results unless explicitly requested.
    tokenKey: { type: String, default: null, select: false },

    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'pending', index: true },
    nextChargeDate: { type: Date, default: null },

    // ─── Demo controls (PRD section 10) ─────────────────────────────────────
    // Number of upcoming FULL card charges that should be forced to fail with
    // insufficient_funds, so the recovery arc can be shown live. Decremented
    // each time a full charge is forced to fail. Partial charges are unaffected,
    // which lets the demo show "fail -> partial -> cleared".
    demoFailFullCharges: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type Subscription = InferSchemaType<typeof subscriptionSchema> & { _id: Types.ObjectId };
export const SubscriptionModel = model('Subscription', subscriptionSchema);
