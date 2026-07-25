/**
 * Formats a database date property value for display.
 *
 * Date-only strings (`"YYYY-MM-DD"`, as produced by `<input type="date">`) are parsed as
 * LOCAL midnight, not UTC. Passing them straight to `new Date(...)` interprets them as UTC
 * midnight, which renders as the previous day in any timezone behind UTC (off-by-one bug).
 *
 * Full ISO timestamps (e.g. `created_time`'s `createdAt`) fall through to the standard
 * `new Date(...)` parse, which is already correct for them.
 */
export function formatPropertyDate(
  dateStr: string | null,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string | null {
  if (!dateStr) return null;
  try {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(dateStr);
    return date.toLocaleDateString('en-US', options);
  } catch {
    return dateStr;
  }
}
