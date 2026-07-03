import type { CycleStatus, PlanInterval, SubscriptionStatus } from "@/lib/types";

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatNaira(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "Not scheduled yet";
  }

  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Waiting";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatInterval(interval: PlanInterval): string {
  switch (interval) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return interval;
  }
}

export function formatStatus(
  status: SubscriptionStatus | CycleStatus | string,
): string {
  return status.replaceAll("_", " ");
}
