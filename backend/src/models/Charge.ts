import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const CHARGE_TYPES = ['full', 'partial'] as const;
export const CHARGE_METHODS = ['card', 'virtual_account'] as const;
export const CHARGE_STATUSES = ['success', 'failed'] as const;

// Normalized failure reasons. Recovery branches on these.
export const FAILURE_REASONS = [
  'insufficient_funds', // soft: no money yet -> retry later
  'card_error', // hard: expired/blocked/invalid card -> stop card retries
  'do_not_honor', // hard-ish: issuer declined -> treat as card_error path
  'timeout', // transient: OTP/network timeout
  'unknown',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

const chargeSchema = new Schema(
  {
    cycleId: { type: Schema.Types.ObjectId, ref: 'BillingCycle', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },

    amountAttempted: { type: Number, required: true },
    amountCharged: { type: Number, default: 0 }, // == attempted on success, 0 on fail

    type: { type: String, enum: CHARGE_TYPES, required: true },
    method: { type: String, enum: CHARGE_METHODS, default: 'card' },
    status: { type: String, enum: CHARGE_STATUSES, required: true },
    failureReason: { type: String, enum: FAILURE_REASONS, default: null },

    nombaRef: { type: String, default: null },
    nombaMessage: { type: String, default: null },

    // Deterministic key (`charge:<cycleId>:<attempt>` or a partial variant).
    // Unique so a retried job can never create a second charge for the same attempt.
    idempotencyKey: { type: String, required: true, unique: true },

    // True when this charge happened after the initial scheduled charge failed
    // (i.e. it is money the Smart Recovery engine clawed back). Powers the
    // "total recovered" counter.
    duringRecovery: { type: Boolean, default: false },

    // True when the failure was simulated by the /demo/simulate-failure control.
    simulated: { type: Boolean, default: false },

    attemptedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export type Charge = InferSchemaType<typeof chargeSchema> & { _id: Types.ObjectId };
export const ChargeModel = model('Charge', chargeSchema);
