import { formatDate, formatInterval, formatNaira } from "@/lib/format";
import type { SubscriptionSummary } from "@/lib/types";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export function SubscriptionsTable({
  subscriptions,
}: {
  subscriptions: SubscriptionSummary[];
}) {
  if (subscriptions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--background-subtle)] p-6 text-sm leading-7 text-[var(--foreground-muted)]">
        No subscriptions yet. Create a plan, send the subscribe link, and the
        first member to check out will appear here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)] text-left">
          <thead className="bg-[var(--background-subtle)] text-xs text-[var(--foreground-muted)]">
            <tr>
              <th className="px-4 py-4 font-medium">Member</th>
              <th className="px-4 py-4 font-medium">Plan</th>
              <th className="px-4 py-4 font-medium">Subscription</th>
              <th className="px-4 py-4 font-medium">Current cycle</th>
              <th className="px-4 py-4 font-medium">Next charge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {subscriptions.map((subscription) => (
              <tr key={subscription.id} className="align-top">
                <td className="px-4 py-5">
                  <p className="font-semibold text-[var(--foreground)]">
                    {subscription.member?.name ?? "Unknown member"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                    {subscription.member?.email ?? "No email"}
                  </p>
                </td>
                <td className="px-4 py-5">
                  <p className="font-semibold text-[var(--foreground)]">
                    {subscription.plan?.name ?? "Unknown plan"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                    {subscription.plan
                      ? `${formatNaira(subscription.plan.amount)} / ${formatInterval(
                          subscription.plan.interval,
                        ).toLowerCase()}`
                      : "Plan unavailable"}
                  </p>
                </td>
                <td className="px-4 py-5">
                  <StatusBadge status={subscription.status} />
                </td>
                <td className="px-4 py-5">
                  {subscription.currentCycle ? (
                    <div className="space-y-2">
                      <StatusBadge status={subscription.currentCycle.status} />
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Remaining:{" "}
                        <span className="font-medium text-[var(--foreground)]">
                          {formatNaira(subscription.currentCycle.amountRemaining)}
                        </span>
                      </p>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Due {formatDate(subscription.currentCycle.dueDate)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      No active billing cycle yet
                    </p>
                  )}
                </td>
                <td className="px-4 py-5">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {formatDate(subscription.nextChargeDate)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
