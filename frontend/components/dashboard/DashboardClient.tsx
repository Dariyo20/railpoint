"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DemoControls } from "@/components/dashboard/DemoControls";
import { RecoveryPanel } from "@/components/dashboard/RecoveryPanel";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { SubscriptionsTable } from "@/components/dashboard/SubscriptionsTable";
import { api } from "@/lib/api";
import { formatDateTime, formatNaira } from "@/lib/format";
import type {
  RecoveryCycle,
  StatsResponse,
  SubscriptionSummary,
} from "@/lib/types";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load dashboard.";
}

export function DashboardClient() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [cycles, setCycles] = useState<RecoveryCycle[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const refreshDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        const [nextStats, nextSubscriptions, nextCycles] = await Promise.all([
          api.getStats(),
          api.getSubscriptions(),
          api.getCycles(),
        ]);

        setStats(nextStats);
        setSubscriptions(nextSubscriptions);
        setCycles(nextCycles);
        setLastUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        setError(toErrorMessage(loadError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshDashboard();
    }, 0);

    const interval = window.setInterval(() => {
      void refreshDashboard({ silent: true });
    }, 8000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshDashboard]);

  const subscriptionsById = useMemo(
    () => new Map(subscriptions.map((subscription) => [subscription.id, subscription])),
    [subscriptions],
  );

  const pendingCount = subscriptions.filter(
    (subscription) => subscription.status === "pending",
  ).length;
  const recoveryCount = cycles.length;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Billing overview
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
            Track subscriptions, balances, and recovery activity
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
            Review current subscription status, upcoming charges, outstanding
            balances, and recovery progress from one dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshDashboard({ silent: true })}
            className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
          >
            {isRefreshing ? "Refreshing..." : "Refresh now"}
          </button>
          <Link
            href="/plans/new"
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
          >
            Create another plan
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total recovered"
          value={formatNaira(stats?.totalRecovered ?? 0)}
          hint="Money collected after a failed charge entered recovery."
        />
        <StatsCard
          title="Subscriptions"
          value={String(subscriptions.length)}
          hint="All customer subscriptions that have been created in the system."
        />
        <StatsCard
          title="Recovery view"
          value={String(recoveryCount)}
          hint={`${pendingCount} pending activation and ${recoveryCount} subscriptions with recovery activity.`}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] p-4 text-sm text-[var(--foreground-muted)]">
        <p>
          Last updated:{" "}
          <span className="font-medium text-[var(--foreground)]">
            {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "Waiting for first load"}
          </span>
        </p>
      </section>

      {error ? (
        <section className="rounded-lg border border-[#ffd7d6] bg-[#ffeeef] p-5 text-sm leading-7 text-[#d8001b]">
          {error}
        </section>
      ) : null}

      {isLoading ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] p-6 text-[var(--foreground-muted)]">
          Loading dashboard...
        </section>
      ) : (
        <>
          <section className="space-y-4">
            <div>
              <p className="text-sm font-medium text-[var(--foreground-muted)]">
                Subscriptions
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                Current member billing state
              </h2>
            </div>
            <SubscriptionsTable subscriptions={subscriptions} />
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-sm font-medium text-[var(--foreground-muted)]">
                Recovery panel
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                Recovery and overdue balances
              </h2>
            </div>
            <RecoveryPanel
              cycles={cycles}
              subscriptionsById={subscriptionsById}
            />
          </section>

          <DemoControls
            subscriptions={subscriptions}
            cycles={cycles}
            onActionComplete={() => refreshDashboard({ silent: true })}
          />
        </>
      )}
    </div>
  );
}
