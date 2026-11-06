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
