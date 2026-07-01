import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const RECOVERY_STRATEGIES = ['card_full', 'card_partial', 'virtual_account'] as const;
export const RECOVERY_RESULTS = ['success', 'partial', 'failed', 'pending'] as const;

const recoveryAttemptSchema = new Schema(
  {
    cycleId: { type: Schema.Types.ObjectId, ref: 'BillingCycle', required: true, index: true },
    attemptNumber: { type: Number, required: true },
    scheduledFor: { type: Date, required: true },
    strategy: { type: String, enum: RECOVERY_STRATEGIES, required: true },
    amountTarget: { type: Number, required: true },
    result: { type: String, enum: RECOVERY_RESULTS, default: 'pending' },
    chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', default: null },
  },
  { timestamps: true }
);

recoveryAttemptSchema.index({ cycleId: 1, attemptNumber: 1 });

export type RecoveryAttempt = InferSchemaType<typeof recoveryAttemptSchema> & { _id: Types.ObjectId };
export const RecoveryAttemptModel = model('RecoveryAttempt', recoveryAttemptSchema);
