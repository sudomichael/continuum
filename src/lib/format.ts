export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function categoryColor(cat: string): string {
  switch (cat) {
    case "decision":
      return "text-tertiary";
    case "blocker":
      return "text-error";
    case "architecture":
      return "text-primary";
    case "idea":
      return "text-secondary";
    case "progress":
      return "text-secondary";
    case "next_action":
      return "text-primary-container";
    case "session":
    default:
      return "text-on-surface-variant";
  }
}
