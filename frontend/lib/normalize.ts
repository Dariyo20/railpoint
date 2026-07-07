import type {
  Member,
  Plan,
  RecoveryCycle,
  SubscriptionSummary,
  VirtualAccount,
} from "@/lib/types";

type RawDoc = {
  _id?: string;
  id?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

interface RawPlan extends RawDoc {
  name: string;
  amount: number;
  interval: Plan["interval"];
}

interface RawMember extends RawDoc {
  name: string;
  email: string;
  phone?: string | null;
  expectedPayday?: number | null;
}

interface RawSubscription extends RawDoc {
  status: SubscriptionSummary["status"];
  nextChargeDate?: string | null;
  member?: SubscriptionSummary["member"];
  plan?: SubscriptionSummary["plan"];
  currentCycle?: SubscriptionSummary["currentCycle"];
}

interface RawRecoveryCycle extends RawDoc {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  amountCollected: number;
  amountRemaining: number;
  status: RecoveryCycle["status"];
  recoveryDeadline?: string | null;
  recoveryAttemptsScheduled?: number;
  virtualAccount?: VirtualAccount | null;
}

function docId(doc: RawDoc): string {
  return String(doc.id ?? doc._id ?? "");
}

function normalizeVirtualAccount(
  value: VirtualAccount | null | undefined,
): VirtualAccount | null {
  if (!value) {
    return null;
  }

  return {
    accountRef: value.accountRef ?? null,
    bankName: value.bankName ?? null,
    bankAccountNumber: value.bankAccountNumber ?? null,
    bankAccountName: value.bankAccountName ?? null,
    expectedAmount: value.expectedAmount ?? null,
    createdAt: value.createdAt ?? null,
  };
}

export function normalizePlan(raw: RawPlan): Plan {
  return {
    id: docId(raw),
    name: raw.name,
    amount: raw.amount,
    interval: raw.interval,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function normalizeMember(raw: RawMember): Member {
  return {
    id: docId(raw),
    name: raw.name,
    email: raw.email,
    phone: raw.phone ?? null,
    expectedPayday: raw.expectedPayday ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function normalizeSubscription(raw: RawSubscription): SubscriptionSummary {
  return {
    id: docId(raw),
    status: raw.status,
    nextChargeDate: raw.nextChargeDate ?? null,
    member: raw.member
      ? {
          id: raw.member.id,
          name: raw.member.name,
          email: raw.member.email,
        }
      : null,
    plan: raw.plan
      ? {
          id: raw.plan.id,
          name: raw.plan.name,
          amount: raw.plan.amount,
          interval: raw.plan.interval,
        }
      : null,
    currentCycle: raw.currentCycle
      ? {
          id: raw.currentCycle.id,
          status: raw.currentCycle.status,
          amountDue: raw.currentCycle.amountDue,
          amountCollected: raw.currentCycle.amountCollected,
          amountRemaining: raw.currentCycle.amountRemaining,
          dueDate: raw.currentCycle.dueDate,
          virtualAccount: normalizeVirtualAccount(raw.currentCycle.virtualAccount),
        }
      : null,
  };
}

export function normalizeRecoveryCycle(raw: RawRecoveryCycle): RecoveryCycle {
  return {
    id: docId(raw),
    subscriptionId: raw.subscriptionId,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    dueDate: raw.dueDate,
    amountDue: raw.amountDue,
    amountCollected: raw.amountCollected,
    amountRemaining: raw.amountRemaining,
    status: raw.status,
    recoveryDeadline: raw.recoveryDeadline ?? null,
    recoveryAttemptsScheduled: raw.recoveryAttemptsScheduled ?? 0,
    virtualAccount: normalizeVirtualAccount(raw.virtualAccount),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}
