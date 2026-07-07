"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatNaira } from "@/lib/format";
import type { RecoveryCycle, SubscriptionSummary } from "@/lib/types";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action failed.";
}

export function DemoControls({
  subscriptions,
  cycles,
  onActionComplete,
}: {
  subscriptions: SubscriptionSummary[];
  cycles: RecoveryCycle[];
  onActionComplete: () => Promise<void>;
}) {
  const pendingSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.status === "pending"),
    [subscriptions],
  );
  const actionableSubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (subscription) =>
          subscription.currentCycle ||
          subscription.status === "active" ||
          subscription.status === "in_recovery" ||
          subscription.status === "past_due",
      ),
    [subscriptions],
  );
  const virtualAccountCycles = useMemo(
    () => cycles.filter((cycle) => cycle.virtualAccount?.bankAccountNumber),
    [cycles],
  );

  const [activateId, setActivateId] = useState("");
  const [advanceId, setAdvanceId] = useState("");
  const [simulateFailureId, setSimulateFailureId] = useState("");
  const [simulateFailureCount, setSimulateFailureCount] = useState("2");
  const [virtualAccountCycleId, setVirtualAccountCycleId] = useState("");
  const [virtualAccountAmount, setVirtualAccountAmount] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const selectedActivateId = pendingSubscriptions.some(
    (subscription) => subscription.id === activateId,
  )
    ? activateId
    : (pendingSubscriptions[0]?.id ?? "");

  const selectedAdvanceId = actionableSubscriptions.some(
    (subscription) => subscription.id === advanceId,
  )
    ? advanceId
    : (actionableSubscriptions[0]?.id ?? "");

  const selectedSimulateFailureId = actionableSubscriptions.some(
    (subscription) => subscription.id === simulateFailureId,
  )
    ? simulateFailureId
    : (actionableSubscriptions[0]?.id ?? "");

  const selectedVirtualAccountCycleId = virtualAccountCycles.some(
    (cycle) => cycle.id === virtualAccountCycleId,
  )
    ? virtualAccountCycleId
    : (virtualAccountCycles[0]?.id ?? "");

  async function runAction(
    actionName: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusyAction(actionName);
    setFeedback(null);

    try {
      await action();
      await onActionComplete();
      setFeedback({ type: "success", message: successMessage });
    } catch (error) {
      setFeedback({ type: "error", message: toErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--foreground-muted)]">
          Manual tools
        </p>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">
          Manage test and edge-case workflows
        </h2>
        <p className="text-sm leading-7 text-[var(--foreground-muted)]">
          Use these actions when testing billing flows or moving a subscription
          through a manual recovery step.
        </p>
      </div>

      {feedback ? (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border border-[#b9f5bc] bg-[#ecfdec] text-[#107d32]"
              : "border border-[#ffd7d6] bg-[#ffeeef] text-[#d8001b]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedActivateId) return;
            void runAction(
              "activate",
              () => api.demoActivate({ subscriptionId: selectedActivateId }),
              "Pending subscription activated.",
            );
          }}
        >
          <p className="text-lg font-semibold text-[var(--foreground)]">
            Activate pending subscription
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Use this if checkout completed but activation has not been confirmed
            yet.
          </p>
          <select
            className="mt-4 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
            value={selectedActivateId}
            onChange={(event) => setActivateId(event.target.value)}
            disabled={pendingSubscriptions.length === 0}
          >
            {pendingSubscriptions.length === 0 ? (
              <option value="">No pending subscriptions</option>
            ) : (
              pendingSubscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.member?.name ?? "Unknown member"} ·{" "}
                  {subscription.plan?.name ?? "Unknown plan"}
                </option>
              ))
            )}
          </select>
          <button
            type="submit"
            disabled={!selectedActivateId || busyAction !== null}
            className="mt-4 inline-flex rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[#7d7d7d]"
          >
            {busyAction === "activate" ? "Activating..." : "Activate"}
          </button>
        </form>

        <form
          className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedAdvanceId) return;
            void runAction(
              "advance",
              () => api.demoAdvance({ subscriptionId: selectedAdvanceId }),
              "Charge cycle advanced and triggered.",
            );
          }}
        >
          <p className="text-lg font-semibold text-[var(--foreground)]">
            Run next cycle now
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Set the current cycle to due now and trigger the next charge
            attempt.
          </p>
          <select
            className="mt-4 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
            value={selectedAdvanceId}
            onChange={(event) => setAdvanceId(event.target.value)}
            disabled={actionableSubscriptions.length === 0}
          >
            {actionableSubscriptions.length === 0 ? (
              <option value="">No subscriptions ready</option>
            ) : (
              actionableSubscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.member?.name ?? "Unknown member"} ·{" "}
                  {subscription.plan?.name ?? "Unknown plan"}
                </option>
              ))
            )}
          </select>
          <button
            type="submit"
            disabled={!selectedAdvanceId || busyAction !== null}
            className="mt-4 inline-flex rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#8f8f8f]"
          >
            {busyAction === "advance" ? "Triggering..." : "Advance cycle"}
          </button>
        </form>

        <form
          className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedSimulateFailureId) return;
            void runAction(
              "simulate-failure",
              () =>
                api.demoSimulateFailure({
                  subscriptionId: selectedSimulateFailureId,
                  fullFailures: Number(simulateFailureCount) || 2,
                }),
              "The next full charge attempts will return insufficient funds.",
            );
          }}
        >
          <p className="text-lg font-semibold text-[var(--foreground)]">
            Trigger failed charge
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Use this while testing recovery behavior for the selected
            subscription.
          </p>
          <select
            className="mt-4 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
            value={selectedSimulateFailureId}
            onChange={(event) => setSimulateFailureId(event.target.value)}
            disabled={actionableSubscriptions.length === 0}
          >
            {actionableSubscriptions.length === 0 ? (
              <option value="">No subscriptions ready</option>
            ) : (
              actionableSubscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.member?.name ?? "Unknown member"} ·{" "}
                  {subscription.plan?.name ?? "Unknown plan"}
                </option>
              ))
            )}
          </select>
          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--foreground-muted)]">
              Number of upcoming full-charge failures
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={simulateFailureCount}
              onChange={(event) => setSimulateFailureCount(event.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={!selectedSimulateFailureId || busyAction !== null}
            className="mt-4 inline-flex rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#8f8f8f]"
          >
            {busyAction === "simulate-failure"
              ? "Simulating..."
              : "Simulate failure"}
          </button>
        </form>

        <form
          className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedVirtualAccountCycleId) return;
            void runAction(
              "simulate-va-credit",
              () =>
                api.demoVirtualAccountCredit({
                  cycleId: selectedVirtualAccountCycleId,
                  amount: virtualAccountAmount
                    ? Number(virtualAccountAmount)
                    : undefined,
                }),
              "Virtual account settlement recorded.",
            );
          }}
        >
          <p className="text-lg font-semibold text-[var(--foreground)]">
            Record virtual account settlement
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Use this after a virtual account has been created for an outstanding
            balance.
          </p>
          <select
            className="mt-4 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
            value={selectedVirtualAccountCycleId}
            onChange={(event) => setVirtualAccountCycleId(event.target.value)}
            disabled={virtualAccountCycles.length === 0}
          >
            {virtualAccountCycles.length === 0 ? (
              <option value="">No virtual-account cycles yet</option>
            ) : (
              virtualAccountCycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.virtualAccount?.bankAccountNumber ?? cycle.id} ·{" "}
                  {formatNaira(cycle.amountRemaining)} remaining · due{" "}
                  {formatDate(cycle.dueDate)}
                </option>
              ))
            )}
          </select>
          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--foreground-muted)]">
              Amount override (optional)
            </span>
            <input
              type="number"
              min={1}
              value={virtualAccountAmount}
              onChange={(event) => setVirtualAccountAmount(event.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
              placeholder="Leave blank to settle the full balance"
            />
          </label>
          <button
            type="submit"
            disabled={!selectedVirtualAccountCycleId || busyAction !== null}
            className="mt-4 inline-flex rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#8f8f8f]"
          >
            {busyAction === "simulate-va-credit"
              ? "Applying..."
              : "Record settlement"}
          </button>
        </form>
      </div>
    </div>
  );
}
