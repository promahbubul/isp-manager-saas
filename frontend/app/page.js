import Link from "next/link";
import { SitePage } from "@/components/marketing/SiteLayout";

// Only list what the product actually does today.
const FEATURES = [
  ["MikroTik automation", "PPPoE accounts are created, disabled on expiry and re-enabled on payment — automatically."],
  ["Billing & recharge", "Prepaid billing with due/advance, printable money receipts and payment history."],
  ["Online bill payment", "Your customers pay with bKash, SSLCommerz (cards, Nagad, Rocket) or Stripe — money goes to your account."],
  ["Bangla SMS", "Welcome, payment, expiry reminder and bulk SMS with templates."],
  ["Support tickets", "Log complaints, assign technicians, notify customers when solved."],
  ["Reports & import", "Collection, due, expiry and package reports in Excel. Import customers from Excel or MikroTik."],
];

export default function Home() {
  return (
    <SitePage>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Run your ISP business from one place.</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Customers, billing, MikroTik, SMS and online payments — built for Bangladeshi ISPs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-md bg-purple-600 px-6 py-3 text-lg font-semibold hover:bg-purple-500">
              Start 14-day free trial
            </Link>
            <Link href="/pricing" className="rounded-md border border-slate-600 px-6 py-3 text-lg hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-purple-700">{title}</h3>
              <p className="mt-2 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </SitePage>
  );
}
