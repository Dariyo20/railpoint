import { formatStatus } from "@/lib/format";

const styles: Record<string, string> = {
  pending: "border-[#ffdc73] bg-[#fff6de] text-[#aa4d00]",
  active: "border-[#b9f5bc] bg-[#ecfdec] text-[#107d32]",
  in_recovery: "border-[#ffdc73] bg-[#fff6de] text-[#aa4d00]",
  recovering: "border-[#ffdc73] bg-[#fff6de] text-[#aa4d00]",
  partial: "border-[#cae7ff] bg-[#f0f7ff] text-[#0059ec]",
  paid: "border-[#b9f5bc] bg-[#ecfdec] text-[#107d32]",
  past_due: "border-[#ffd7d6] bg-[#ffeeef] text-[#d8001b]",
  cancelled: "border-[var(--border)] bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
  scheduled: "border-[var(--border)] bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    styles[status] ??
    "border-[var(--border)] bg-[var(--background-subtle)] text-[var(--foreground-muted)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium capitalize ${tone}`}
    >
      {formatStatus(status)}
    </span>
  );
}
