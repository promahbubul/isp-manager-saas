import Link from "next/link";
import { SitePage } from "@/components/marketing/SiteLayout";
import { API_URL } from "@/lib/api";

export const metadata = { title: "Pricing" };
export const revalidate = 300;

const limit = (n) => (n === -1 ? "Unlimited" : n.toLocaleString("en-IN"));
const fmt = (n) => `৳${Number(n).toLocaleString("en-IN")}`;

async function getPlans() {
  try {
    const res = await fetch(`${API_URL}/public/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json()).data ?? [];
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const plans = await getPlans();
  return (
    <SitePage>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-center text-4xl font-extrabold text-slate-900">Simple pricing</h1>
        <p className="mt-3 text-center text-slate-600">14-day free trial on every plan. No card required. Yearly billing = 2 months free.</p>
        {plans.length === 0 ? (
          <p className="mt-12 text-center text-slate-500">Plans are loading — please refresh in a moment.</p>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p, i) => (
              <div key={p._id} className={`flex flex-col rounded-xl border p-6 ${i === 1 ? "border-purple-600 shadow-lg ring-2 ring-purple-200" : "border-slate-200"}`}>
                {i === 1 && <span className="mb-2 self-start rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">Most popular</span>}
                <h2 className="text-xl font-bold">{p.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                <p className="mt-5 text-4xl font-extrabold">
                  {p.priceBDT.monthly > 0 ? fmt(p.priceBDT.monthly) : "Custom"}
                  {p.priceBDT.monthly > 0 && <span className="text-base font-normal text-slate-500">/month</span>}
                </p>
                {p.priceBDT.yearly > 0 && <p className="text-sm text-slate-500">{fmt(p.priceBDT.yearly)} per year</p>}
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  <li>✓ Up to {limit(p.limits.customers)} customers</li>
                  <li>✓ {limit(p.limits.routers)} MikroTik router(s)</li>
                  <li>✓ {limit(p.limits.staff)} staff accounts</li>
                  <li>✓ Auto billing, SMS, reports</li>
                  {p.features.map((f) => (
                    <li key={f}>✓ {f.replace(/_/g, " ")}</li>
                  ))}
                </ul>
                <Link
                  href={p.priceBDT.monthly > 0 ? "/signup" : "/contact"}
                  className="mt-6 rounded-md bg-purple-600 py-2.5 text-center font-semibold text-white hover:bg-purple-500"
                >
                  {p.priceBDT.monthly > 0 ? "Start free trial" : "Contact sales"}
                </Link>
              </div>
            ))}
          </div>
        )}
        <p className="mt-10 text-center text-sm text-slate-500">
          Prices include all features listed. SMS credits are bought separately. See our{" "}
          <Link href="/refund-policy" className="underline">refund policy</Link>.
        </p>
      </section>
    </SitePage>
  );
}
