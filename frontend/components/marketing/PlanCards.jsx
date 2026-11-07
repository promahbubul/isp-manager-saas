import { Building2, Check, Rocket, Sprout, TrendingUp } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/cn";

const limit = (n) => (n === -1 ? "Unlimited" : n.toLocaleString("en-IN"));
const fmt = (n) => `৳${Number(n).toLocaleString("en-IN")}`;

const FEATURE_LABEL = {
  online_payment: "Online bill payment",
  customer_portal: "Customer self-care portal",
  ticket: "Support tickets",
  reseller: "Resellers",
  inventory: "Inventory",
  ip_log: "BTRC IP log",
  custom_domain: "Portal on your own domain",
  own_sms_gateway: "Your own SMS gateway",
  whatsapp: "WhatsApp notifications",
  api_access: "API access",
  white_label: "White label",
};

/** One colour per plan — used for the top bar, icon and button. */
const THEME = {
  starter: { icon: Sprout, bar: "from-sky-400 to-sky-600", chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400", btn: "bg-sky-600 hover:bg-sky-500", check: "text-sky-600 dark:text-sky-400" },
  growth: { icon: TrendingUp, bar: "from-indigo-400 to-indigo-600", chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", btn: "bg-indigo-600 hover:bg-indigo-500", check: "text-indigo-600 dark:text-indigo-400" },
  pro: { icon: Rocket, bar: "from-violet-400 to-fuchsia-600", chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400", btn: "bg-violet-600 hover:bg-violet-500", check: "text-violet-600 dark:text-violet-400" },
  enterprise: { icon: Building2, bar: "from-amber-400 to-orange-600", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", btn: "bg-[#18181b] hover:bg-[#3f3f46] dark:bg-white dark:text-[#18181b] dark:hover:bg-[#e4e4e7]", check: "text-amber-600 dark:text-amber-400" },
};
const FALLBACK = THEME.growth;

export async function getPlans() {
  try {
    const res = await fetch(`${API_URL}/public/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json()).data ?? [];
  } catch {
    return [];
  }
}

export function PlanCards({ plans }) {
  if (!plans.length) return <p className="text-center text-muted">Plans are loading — please refresh in a moment.</p>;
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => {
        const t = THEME[p.slug] ?? FALLBACK;
        const paid = p.priceBDT.monthly > 0;
        const popular = p.slug === "growth";
        const features = [p.limits.customers === -1 ? "Unlimited customers" : `Up to ${limit(p.limits.customers)} customers`, `${limit(p.limits.routers)} MikroTik router${p.limits.routers === 1 ? "" : "s"}`, `${limit(p.limits.staff)} staff accounts`, "Auto billing, SMS & reports", ...p.features.map((f) => FEATURE_LABEL[f] ?? f.replace(/_/g, " "))];
        return (
          <div key={p._id} className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:shadow-xl", popular ? "border-indigo-500/60" : "border-line")}>
            <div className={cn("h-1.5 bg-gradient-to-r", t.bar)} />
            <div className="flex flex-1 flex-col p-6">
              <div className="flex items-center justify-between">
                <span className={cn("grid size-10 place-items-center rounded-xl", t.chip)}>
                  <t.icon className="size-5" />
                </span>
                {popular && <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">Most popular</span>}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{p.name}</h3>
              <p className="mt-1 min-h-15 text-sm text-muted">{p.description}</p>
              <p className="tabular mt-5 text-4xl font-bold tracking-tight text-ink">
                {paid ? fmt(p.priceBDT.monthly) : "Custom"}
                {paid && <span className="text-base font-normal text-muted"> /month</span>}
              </p>
              <p className="mt-1 h-5 text-sm text-muted">{p.priceBDT.yearly > 0 ? `${fmt(p.priceBDT.yearly)} billed yearly` : "Talk to us for a quote"}</p>
              <Link href={paid ? "/signup" : "/contact"} className={cn("mt-6 rounded-lg py-2.5 text-center text-sm font-semibold text-white shadow-sm transition", t.btn)}>
                {paid ? "Start free trial" : "Contact sales"}
              </Link>
              <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6 text-sm text-ink">
                {features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className={cn("mt-0.5 size-4 shrink-0", t.check)} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
