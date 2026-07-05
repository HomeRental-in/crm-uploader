/**
 * Parse a dd/mm/yyyy date string into an ISO date (yyyy-mm-dd) for Postgres.
 *
 * JavaScript's native Date parser reads "13/04/2025" as mm/dd and fails, so we
 * parse the fixed dd/mm/yyyy format explicitly. Returns null for blank/invalid
 * values (the row is still stored, just without a filterable record_date).
 */
export function parseDMY(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject impossible dates like 31/02/2025.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
