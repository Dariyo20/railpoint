import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { formatDate, formatNaira } from "@/lib/format";
import type { RecoveryCycle, SubscriptionSummary } from "@/lib/types";

export function RecoveryPanel({
  cycles,
  subscriptionsById,
}: {
  cycles: RecoveryCycle[];
  subscriptionsById: Map<string, SubscriptionSummary>;
}) {
  if (cycles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--background-subtle)] p-6 text-sm leading-7 text-[var(--foreground-muted)]">
        No subscriptions are currently in recovery. Once you simulate a failed
        charge, the partial, recovering, and past-due cycles will show up here.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cycles.map((cycle) => {
        const subscription = subscriptionsById.get(cycle.subscriptionId);

        return (
          <article
            key={cycle.id}
            className="rounded-lg border border-[var(--border)] bg-white p-5 shadow-[0_2px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {subscription?.member?.name ?? "Unknown member"}
                </p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {subscription?.plan?.name ?? "Plan unavailable"}
                </p>
              </div>
              <StatusBadge status={cycle.status} />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4">
                <p className="text-sm text-[var(--foreground-muted)]">Outstanding</p>
                <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                  {formatNaira(cycle.amountRemaining)}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4">
                <p className="text-sm text-[var(--foreground-muted)]">
                  Collected so far
                </p>
                <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                  {formatNaira(cycle.amountCollected)}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm text-[var(--foreground-muted)]">
              <p>
                Due date:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatDate(cycle.dueDate)}
                </span>
              </p>
              <p>
                Recovery deadline:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatDate(cycle.recoveryDeadline)}
                </span>
              </p>
              <p>
                Recovery attempts scheduled:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {cycle.recoveryAttemptsScheduled}
                </span>
              </p>
            </div>

            {cycle.virtualAccount ? (
              <div className="mt-5 rounded-md border border-[#cae7ff] bg-[#f0f7ff] p-4">
                <p className="text-sm font-medium text-[#0059ec]">
                  Virtual account fallback
                </p>
                <div className="mt-3 space-y-1 text-sm text-[var(--foreground)]">
                  <p>{cycle.virtualAccount.bankName ?? "Bank pending"}</p>
                  <p className="font-mono">
                    {cycle.virtualAccount.bankAccountNumber ?? "Account pending"}
                  </p>
                  <p>{cycle.virtualAccount.bankAccountName ?? "Name pending"}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4 text-sm leading-7 text-[var(--foreground-muted)]">
                Recovery is still on the card rail. Once the recovery window is
                exhausted, virtual account fallback details will appear here.
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
