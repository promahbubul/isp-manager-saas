/** Normalize a Bangladeshi mobile number to 01XXXXXXXXX. Returns null if invalid. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("88") ? digits.slice(2) : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}
