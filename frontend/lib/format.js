const takaFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const taka = (n) => `৳${takaFormatter.format(Number(n) || 0)}`;

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dhaka",
});

export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : "—");
export const formatDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : "—");

/** yyyy-mm-dd for <input type="date"> (Dhaka local date). */
export const toDateInput = (d) => {
  if (!d) return "";
  const local = new Date(new Date(d).getTime() + 6 * 3600_000);
  return local.toISOString().slice(0, 10);
};

/** Days from now until `d` (negative when past). */
export const daysUntil = (d) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);

const METHOD_LABELS = { cash: "Cash", bkash: "bKash", nagad: "Nagad", rocket: "Rocket", bank: "Bank", online: "Online", sslcommerz: "SSLCommerz", stripe: "Stripe", manual: "Send Money", other: "Other" };
/** "bkash" → "bKash", "sslcommerz" → "SSLCommerz" */
export const methodLabel = (m) => METHOD_LABELS[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ") : "—");

/** "2026-08" → "Aug 2026" */
export const monthLabel = (ym) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym ?? "";
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};
