import Link from "next/link";

const pillars = [
  {
    title: "Recurring checkout",
    description:
      "Create a plan, share a payment link, and start recurring billing from the first successful checkout.",
  },
  {
    title: "Recovery workflows",
    description:
      "Track failed charges, recovery activity, partial collection, and fallback payment paths in one place.",
  },
  {
    title: "Billing visibility",
    description:
      "See subscription status, balances, upcoming charges, and recovered revenue from the dashboard.",
  },
];

const steps = [
  "Set a billing amount and interval for your membership plan.",
  "Share a checkout link with customers and collect the first payment.",
  "Track recurring billing status and upcoming charges from the dashboard.",
  "Review recovery activity when a payment needs another attempt.",
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background-subtle)] px-3 py-1 text-sm text-[var(--foreground-muted)]">
            Recurring billing platform
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
              Payday-aware recurring billing for Nigerian membership businesses.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
              Railpoint helps membership businesses collect recurring payments,
              monitor billing status, and recover missed charges with less
              manual follow-up.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/plans/new"
              className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
            >
              Create plan
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
            >
              Open dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-[var(--foreground-muted)]">
                How it works
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                From plan creation to recovery tracking
              </h2>
            </div>

            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-md border border-[var(--border)] bg-[var(--background-subtle)] p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-[var(--foreground-muted)]">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {pillars.map((pillar) => (
          <article
            key={pillar.title}
            className="rounded-lg border border-[var(--border)] bg-white p-6"
          >
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              {pillar.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
              {pillar.description}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] p-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Why teams use Railpoint
          </p>
          <h2 className="text-3xl font-semibold text-[var(--foreground)]">
            A billing workflow built for collection reliability
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-white p-5">
            <p className="text-sm text-[var(--foreground-muted)]">
              Checkout and token capture
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              One member action, recurring rails after that.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white p-5">
            <p className="text-sm text-[var(--foreground-muted)]">
              Failure recovery
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              Retries, partial collection, and fallback made visible.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white p-5">
            <p className="text-sm text-[var(--foreground-muted)]">
              Merchant confidence
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              Clear statuses, next charge dates, and overdue visibility.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white p-5">
            <p className="text-sm text-[var(--foreground-muted)]">
              Recovered revenue
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              A live counter that proves Railpoint collects what others lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
