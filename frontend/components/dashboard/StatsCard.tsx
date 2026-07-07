export function StatsCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-[0_2px_2px_rgba(0,0,0,0.04)]">
      <p className="text-sm text-[var(--foreground-muted)]">{title}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
        {value}
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
        {hint}
      </p>
    </article>
  );
}
