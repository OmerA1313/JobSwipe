export function StatusChip({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone =
    normalized === "SUBMITTED"
      ? "success"
      : normalized === "FAILED"
      ? "danger"
      : normalized === "NEEDS_INPUT"
      ? "warn"
      : normalized === "RUNNING" || normalized === "QUEUED"
      ? "info"
      : "neutral";

  return <span className={`status-chip status-chip-${tone}`}>{status}</span>;
}
