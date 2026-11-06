const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "15m" | "30d" | "12h" -> milliseconds */
export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNITS[match[2]];
}

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * UNITS.d);
