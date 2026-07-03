import { formatDistanceToNowStrict, format } from "date-fns";

// "5m", "3h", "2d" - compact relative time
export function timeAgo(date: Date | string | number): string {
  const d =
    typeof date === "number" ? new Date(date) : typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: false })
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ weeks?/, "w")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y")
    .replace(/^0s$/, "now");
}

// "5m ago", "3h ago", falls back to "12 Jan 2025"
export function timeAgoLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();

  if (diffMs < 604800000) {
    return formatDistanceToNowStrict(d, { addSuffix: true })
      .replace(/ seconds?/, "s")
      .replace(/ minutes?/, "m")
      .replace(/ hours?/, "h")
      .replace(/ days?/, "d");
  }

  return format(d, "d MMM yyyy");
}
