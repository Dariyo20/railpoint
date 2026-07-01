import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const CYCLE_STATUSES = [
  'scheduled',
  'paid',
  'partial',
  'recovering',
  'past_due',
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

const billingCycleSchema = new Schema(
  {
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    dueDate: { type: Date, required: true, index: true },

    amountDue: { type: Number, required: true }, // whole naira
    amountCollected: { type: Number, default: 0 },

    status: { type: String, enum: CYCLE_STATUSES, default: 'scheduled', index: true },

    // dueDate + recovery window. After this, card recovery stops and we fall
    // back to a virtual account.
    recoveryDeadline: { type: Date, default: null },

    // How many recovery attempts have been scheduled so far.
    recoveryAttemptsScheduled: { type: Number, default: 0 },

    // Virtual-account fallback details (populated when the window closes unpaid).
    virtualAccount: {
      type: new Schema(
        {
          accountRef: String,
          bankName: String,
          bankAccountNumber: String,
          bankAccountName: String,
          expectedAmount: Number,
          createdAt: Date,
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

billingCycleSchema.virtual('amountRemaining').get(function (this: BillingCycle) {
  return Math.max(0, this.amountDue - this.amountCollected);
});

export type BillingCycle = InferSchemaType<typeof billingCycleSchema> & {
  _id: Types.ObjectId;
  amountRemaining: number;
};
export const BillingCycleModel = model('BillingCycle', billingCycleSchema);
