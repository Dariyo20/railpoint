export type PlanInterval = "daily" | "weekly" | "monthly";

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "in_recovery"
  | "past_due"
  | "cancelled";

export type CycleStatus =
  | "scheduled"
  | "paid"
  | "partial"
  | "recovering"
  | "past_due";

export interface Plan {
  id: string;
  name: string;
  amount: number;
  interval: PlanInterval;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  expectedPayday: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VirtualAccount {
  accountRef?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  expectedAmount?: number | null;
  createdAt?: string | null;
}

export interface SubscriptionMemberSummary {
  id: string;
  name: string;
  email: string;
}

export interface SubscriptionPlanSummary {
  id: string;
  name: string;
  amount: number;
  interval: PlanInterval;
}

export interface SubscriptionCycleSummary {
  id: string;
  status: CycleStatus;
  amountDue: number;
  amountCollected: number;
  amountRemaining: number;
  dueDate: string;
  virtualAccount: VirtualAccount | null;
}

export interface SubscriptionSummary {
  id: string;
  status: SubscriptionStatus;
  nextChargeDate: string | null;
  member: SubscriptionMemberSummary | null;
  plan: SubscriptionPlanSummary | null;
  currentCycle: SubscriptionCycleSummary | null;
}

export interface RecoveryCycle {
  id: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  amountCollected: number;
  amountRemaining: number;
  status: CycleStatus;
  recoveryDeadline: string | null;
  recoveryAttemptsScheduled: number;
  virtualAccount: VirtualAccount | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StatsResponse {
  totalRecovered: number;
}

export interface InitiateSubscriptionResponse {
  subscriptionId: string;
  orderReference: string;
  checkoutLink: string;
  amount: number;
}

export interface CreatePlanInput {
  name: string;
  amount: number;
  interval: PlanInterval;
}

export interface CreateMemberInput {
  name: string;
  email: string;
  phone?: string;
  expectedPayday?: number;
}

export interface DemoActivateInput {
  subscriptionId: string;
}

export interface DemoAdvanceInput {
  cycleId?: string;
  subscriptionId?: string;
}

export interface DemoSimulateFailureInput {
  subscriptionId: string;
  fullFailures?: number;
}

export interface DemoVirtualAccountCreditInput {
  cycleId: string;
  amount?: number;
}

export interface DemoActionResponse {
  subscriptionId?: string;
  cycleId?: string;
  status?: string;
  triggered?: boolean;
  detail?: string;
  note?: string;
  amount?: number;
  demoFailFullCharges?: number;
}
