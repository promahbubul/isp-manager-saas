/** Bangladesh is UTC+6 with no DST, so day boundaries can be computed without a tz library. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDhakaDay(date = new Date()): Date {
  const local = date.getTime() + DHAKA_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS);
}

/** Query param "2026-11-06" → start of that day in Dhaka; full ISO strings are used as-is. */
export function parseDay(v: unknown): Date | null {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+06:00`) : new Date(v);
}

/** "06/11/2026" in Dhaka time — used in SMS text. */
export function formatDhakaDate(date: Date): string {
  const d = new Date(date.getTime() + DHAKA_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function startOfDhakaMonth(date = new Date()): Date {
  const local = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - DHAKA_OFFSET_MS);
}
