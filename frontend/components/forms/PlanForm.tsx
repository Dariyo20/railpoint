"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatInterval, formatNaira } from "@/lib/format";
import type { Plan, PlanInterval } from "@/lib/types";

const intervalOptions: PlanInterval[] = ["daily", "weekly", "monthly"];

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function PlanForm() {
  const [name, setName] = useState("Monthly Membership");
  const [amount, setAmount] = useState("10000");
  const [interval, setInterval] = useState<PlanInterval>("monthly");
  const [createdPlan, setCreatedPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subscribePath = createdPlan ? `/subscribe/${createdPlan.id}` : null;
  const subscribeUrl = useMemo(() => {
    if (!subscribePath || typeof window === "undefined") {
      return subscribePath;
    }

    return `${window.location.origin}${subscribePath}`;
  }, [subscribePath]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setCreatedPlan(null);
    setCopyState("idle");

    try {
      const plan = await api.createPlan({
        name: name.trim(),
        amount: Number(amount),
        interval,
      });
      setCreatedPlan(plan);
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!subscribeUrl || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(subscribeUrl);
    setCopyState("copied");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Plan setup
          </p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">
            Create a billing plan
          </h1>
          <p className="text-sm leading-7 text-[var(--foreground-muted)]">
            Set the billing amount and interval, then generate a shareable
            checkout link for customers.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Plan name</span>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monthly Membership"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Amount (NGN)
            </span>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)]"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="10000"
              min={1}
              inputMode="numeric"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Billing interval
            </span>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] outline-none"
              value={interval}
              onChange={(event) => setInterval(event.target.value as PlanInterval)}
            >
              {intervalOptions.map((option) => (
                <option key={option} value={option}>
                  {formatInterval(option)}
                </option>
              ))}
            </select>
          </label>

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
            {isSubmitting ? "Creating plan..." : "Create plan"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] p-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Checkout link
          </p>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">
            Share the plan and monitor activity
          </h2>
          <p className="text-sm leading-7 text-[var(--foreground-muted)]">
            After a customer starts checkout, you can track subscription and
            billing activity from the dashboard.
          </p>
        </div>

        {createdPlan ? (
          <div className="mt-8 space-y-5 rounded-lg border border-[#b9f5bc] bg-[#ecfdec] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#b9f5bc] bg-white px-3 py-1 text-xs font-medium text-[#107d32]">
                Plan created
              </span>
              <span className="text-sm text-[var(--foreground-muted)]">
                ID:{" "}
                <span className="font-mono text-[var(--foreground)]">
                  {createdPlan.id}
                </span>
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <p className="text-sm text-[var(--foreground-muted)]">Name</p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                  {createdPlan.name}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <p className="text-sm text-[var(--foreground-muted)]">Charge</p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                  {formatNaira(createdPlan.amount)} /{" "}
                  {formatInterval(createdPlan.interval).toLowerCase()}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-sm text-[var(--foreground-muted)]">Subscribe link</p>
              <p className="mt-2 break-all font-mono text-sm text-[var(--foreground)]">
                {subscribeUrl ?? subscribePath}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {subscribePath ? (
                <Link
                  href={subscribePath}
                  className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
                >
                  Open subscribe page
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
              >
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-dashed border-[var(--border-strong)] bg-white p-5 text-sm leading-7 text-[var(--foreground-muted)]">
            Your plan summary and checkout link will appear here after you
            create the plan.
          </div>
        )}
      </section>
    </div>
  );
}
