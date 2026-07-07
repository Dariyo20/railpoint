"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  formatDate,
  formatInterval,
  formatNaira,
  formatStatus,
} from "@/lib/format";
import type {
  InitiateSubscriptionResponse,
  Plan,
  SubscriptionSummary,
} from "@/lib/types";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function MemberForm({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [expectedPayday, setExpectedPayday] = useState("");

  const [checkoutState, setCheckoutState] =
    useState<InitiateSubscriptionResponse | null>(null);
  const [subscriptionState, setSubscriptionState] =
    useState<SubscriptionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const subscriptionId = checkoutState?.subscriptionId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      setIsLoadingPlan(true);
      setPlanError(null);

      try {
        const loadedPlan = await api.getPlan(planId);
        if (!cancelled) {
          setPlan(loadedPlan);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPlanError(toErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPlan(false);
        }
      }
    }

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [planId]);

  const refreshSubscriptionStatus = useCallback(async () => {
    if (!subscriptionId) {
      return;
    }

    const subscriptions = await api.getSubscriptions();
    const matched = subscriptions.find(
      (subscription) => subscription.id === subscriptionId,
    );

    if (matched) {
      setSubscriptionState(matched);
    }
  }, [subscriptionId]);

  useEffect(() => {
    if (!subscriptionId) {
      return;
    }

    if (
      subscriptionState?.status === "active" ||
      subscriptionState?.status === "in_recovery" ||
      subscriptionState?.status === "past_due"
    ) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        if (!cancelled) {
          await refreshSubscriptionStatus();
        }
      } catch {
        // Polling should not disrupt the checkout page. The dashboard gives a
        // clearer operational view if the webhook/delivery is delayed.
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshSubscriptionStatus, subscriptionId, subscriptionState?.status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setCheckoutState(null);
    setSubscriptionState(null);

    try {
      const createdMember = await api.createMember({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        expectedPayday: expectedPayday ? Number(expectedPayday) : undefined,
      });

      const initiated = await api.initiateSubscription({
        planId: plan.id,
        memberId: createdMember.id,
      });

      setCheckoutState(initiated);
      setSubscriptionState({
        id: initiated.subscriptionId,
        status: "pending",
        nextChargeDate: null,
        member: {
          id: createdMember.id,
          name: createdMember.name,
          email: createdMember.email,
        },
        plan: {
          id: plan.id,
          name: plan.name,
          amount: plan.amount,
          interval: plan.interval,
        },
        currentCycle: null,
      });
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingPlan) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] p-6 text-[var(--foreground-muted)]">
        Loading plan details...
      </div>
    );
  }

  if (!plan || planError) {
    return (
      <div className="rounded-lg border border-[#ffd7d6] bg-[#ffeeef] p-6">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Plan unavailable
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#d8001b]">
          {planError ??
            "This plan could not be loaded. Double-check the link or create a new plan from the merchant setup page."}
        </p>
        <div className="mt-6">
          <Link
            href="/plans/new"
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
          >
            Create a new plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Plan summary
          </p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">
            {plan.name}
          </h1>
          <p className="text-sm leading-7 text-[var(--foreground-muted)]">
            Start checkout for this plan and use the dashboard to track billing
            status after activation.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4">
            <p className="text-sm text-[var(--foreground-muted)]">Charge</p>
            <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">
              {formatNaira(plan.amount)}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4">
            <p className="text-sm text-[var(--foreground-muted)]">Interval</p>
            <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">
              {formatInterval(plan.interval)}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-md border border-[#cae7ff] bg-[#f0f7ff] p-4 text-sm leading-7 text-[#0059ec]">
          Checkout opens on Nomba. After payment, subscription status updates
          can be reviewed from the dashboard.
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Customer details
          </p>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">
            Continue to checkout
          </h2>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Full name
            </span>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Teni Ade"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Email address
            </span>
            <input
              type="email"
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@example.com"
              required
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                Phone (optional)
              </span>
              <input
                className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="080..."
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--foreground)]">
                Expected payday (optional)
              </span>
              <input
                type="number"
                min={1}
                max={28}
                className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
                value={expectedPayday}
                onChange={(event) => setExpectedPayday(event.target.value)}
                placeholder="25"
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-md border border-[#ffd7d6] bg-[#ffeeef] px-4 py-3 text-sm text-[#d8001b]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[#7d7d7d]"
          >
            {isSubmitting ? "Starting checkout..." : "Continue to checkout"}
          </button>
        </form>

        {checkoutState ? (
          <div className="mt-8 space-y-5 rounded-lg border border-[#b9f5bc] bg-[#ecfdec] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#b9f5bc] bg-white px-3 py-1 text-xs font-medium text-[#107d32]">
                Checkout ready
              </span>
              <span className="text-sm text-[var(--foreground-muted)]">
                Status:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {formatStatus(subscriptionState?.status ?? "pending")}
                </span>
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <p className="text-sm text-[var(--foreground-muted)]">Amount</p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                  {formatNaira(checkoutState.amount)}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <p className="text-sm text-[var(--foreground-muted)]">Subscription ID</p>
                <p className="mt-2 break-all font-mono text-sm text-[var(--foreground)]">
                  {checkoutState.subscriptionId}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-sm text-[var(--foreground-muted)]">Checkout link</p>
              <p className="mt-2 break-all font-mono text-sm text-[var(--foreground)]">
                {checkoutState.checkoutLink}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={checkoutState.checkoutLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
              >
                Open checkout
              </a>
              <button
                type="button"
                onClick={() => void refreshSubscriptionStatus()}
                className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
              >
                Refresh status
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
              >
                Open dashboard
              </Link>
            </div>

            <div className="rounded-md border border-[var(--border)] bg-white p-4 text-sm leading-7 text-[var(--foreground-muted)]">
              <p>
                Next charge:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatDate(subscriptionState?.nextChargeDate)}
                </span>
              </p>
              <p className="mt-2">
                If activation is still pending, wait a few seconds and refresh
                the status. Manual tools are available from the dashboard while
                testing the flow.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
