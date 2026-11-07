import { ArrowRight, BarChart3, Check, CreditCard, Headset, RadioTower, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Reveal, TypeWords } from "@/components/marketing/Motion";
import { getPlans, PlanCards } from "@/components/marketing/PlanCards";
import { PhoneShot, Screenshot } from "@/components/marketing/Screenshot";
import { SitePage } from "@/components/marketing/SiteLayout";
import customersDark from "@/public/screens/customers-dark.png";
import customersLight from "@/public/screens/customers-light.png";
import dashboardDark from "@/public/screens/dashboard-dark.png";
import dashboardLight from "@/public/screens/dashboard-light.png";
import paymentsDark from "@/public/screens/payments-dark.png";
import paymentsLight from "@/public/screens/payments-light.png";
import portalDark from "@/public/screens/portal-dark.png";
import portalLight from "@/public/screens/portal-light.png";

export const revalidate = 300;

const INTEGRATIONS = ["MikroTik RouterOS", "bKash", "SSLCommerz", "Stripe", "PutulHost SMS", "Twilio", "FreeRADIUS", "WireGuard", "Huawei OLT", "BDCOM OLT"];

const ROWS = [
  {
    eyebrow: "Customers & MikroTik",
    title: "Every connection, in sync with your router",
    text: "Add a customer once and the PPPoE secret is created on your MikroTik. When the bill expires the line goes off; when they pay, it comes back on.",
    points: ["RouterOS 6 and 7, over the API or our VPN", "Import existing users from MikroTik or Excel", "Zones, packages and status filters"],
    shot: { light: customersLight, dark: customersDark, alt: "Customer list with package, zone, expiry and status" },
  },
  {
    eyebrow: "Billing & collection",
    title: "Know who paid, who owes and who collected it",
    text: "Record cash at the counter or let collectors take payments in the field. Online payments land in your own bKash, SSLCommerz or Stripe account.",
    points: ["Printable money receipts and SMS receipts", "Prepaid and postpaid billing", "Cash handover between collectors"],
    shot: { light: paymentsLight, dark: paymentsDark, alt: "Payment history with receipt, method and collector" },
  },
];

const MORE = [
  { icon: Headset, title: "Support tickets", text: "Assign complaints to technicians and notify the customer when solved." },
  { icon: Users, title: "Resellers & staff", text: "Role-based logins for every staff member and prepaid reseller wallets." },
  { icon: BarChart3, title: "Reports & accounts", text: "Collection, due and expiry reports, P&L and cash book — export to Excel." },
  { icon: RadioTower, title: "RADIUS & OLT", text: "FreeRADIUS authentication and ONU signal monitoring for fiber networks." },
  { icon: CreditCard, title: "SMS your way", text: "Buy credits from us or connect PutulHost, Twilio, Vonage or Plivo." },
  { icon: ShieldCheck, title: "Safe by default", text: "Each ISP's data is isolated, passwords are encrypted and every change is logged." },
];

function Points({ items }) {
  return (
    <ul className="mt-6 space-y-2.5">
      {items.map((p) => (
        <li key={p} className="flex gap-2.5 text-sm text-ink">
          <Check className="mt-0.5 size-4 shrink-0 text-primary-600 dark:text-primary-400" />
          {p}
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const plans = await getPlans();
  return (
    <SitePage>
      {/* Hero */}
      <section className="overflow-hidden border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:pt-24">
          <div className="max-w-3xl">
            <h1 className="animate-pop-in text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">ISP billing that runs itself.</h1>
            <p className="mt-6 animate-pop-in text-lg text-muted [animation-delay:120ms] sm:text-xl">
              Automate <TypeWords words={["monthly billing", "line cut-off", "SMS reminders", "online payments"]} className="font-medium text-ink" />
              <br className="hidden sm:block" /> for your MikroTik network — built for ISPs in Bangladesh.
            </p>
            <div className="mt-8 flex animate-pop-in flex-wrap items-center gap-3 [animation-delay:240ms]">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500">
                Start 1-year free trial <ArrowRight className="size-4" />
              </Link>
              <span className="text-sm text-muted">No card required</span>
            </div>
          </div>

          <div className="relative mt-14 animate-pop-in [animation-delay:360ms]">
            <Screenshot light={dashboardLight} dark={dashboardDark} alt="ISP Manager dashboard with collection, dues and customer status" priority className="rounded-b-none border-b-0" />
            <div className="absolute -left-2 top-1/3 hidden animate-float rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:block lg:-left-10">
              <p className="text-xs text-muted">Payment received · bKash</p>
              <p className="tabular mt-0.5 text-sm font-semibold text-ink">৳800 — Selina Akter</p>
            </div>
            <div className="absolute -right-2 top-2/3 hidden animate-float rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] [animation-delay:-3s] md:block lg:-right-10">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Line re-enabled on router
              </p>
              <p className="mt-0.5 text-sm font-semibold text-ink">rahim159 · 20 Mbps</p>
            </div>
          </div>
        </div>
      </section>

      {/* Works with */}
      <section className="border-b border-line bg-canvas py-6">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6">
          <p className="hidden shrink-0 text-sm text-muted sm:block">Works with</p>
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            <div className="flex w-max animate-marquee gap-10">
              {[...INTEGRATIONS, ...INTEGRATIONS].map((n, i) => (
                <span key={i} className="whitespace-nowrap text-sm font-semibold text-zinc-500">
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature rows */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 space-y-24 px-4 py-24 sm:px-6">
        {ROWS.map((r, i) => (
          <div key={r.title} className="grid items-center gap-10 lg:grid-cols-12">
            <Reveal className={i % 2 ? "lg:order-2 lg:col-span-4" : "lg:col-span-4"}>
              <p className="text-sm font-medium text-primary-600 dark:text-primary-400">{r.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{r.title}</h2>
              <p className="mt-4 leading-relaxed text-muted">{r.text}</p>
              <Points items={r.points} />
            </Reveal>
            <Reveal delay={120} className={i % 2 ? "lg:order-1 lg:col-span-8" : "lg:col-span-8"}>
              <Screenshot {...r.shot} sizes="(min-width: 1024px) 760px, 100vw" />
            </Reveal>
          </div>
        ))}

        <div className="grid items-center gap-10 rounded-3xl border border-line bg-surface p-8 sm:p-12 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-medium text-primary-600 dark:text-primary-400">Customer portal</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Fewer calls to your office</h2>
            <p className="mt-4 leading-relaxed text-muted">Each customer gets a self-care page on your brand. They check validity, pay the bill, download receipts and report problems — from any phone.</p>
            <Points items={["Login with PPPoE details or an SMS code", "Pay without logging in", "Installs on the phone like an app"]} />
          </Reveal>
          <Reveal delay={120}>
            <PhoneShot light={portalLight} dark={portalDark} alt="Customer portal on a phone showing package, validity and pay bill button" />
          </Reveal>
        </div>
      </section>

      {/* Everything else */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-ink">And the rest of the business, in the same panel</h2>
          </Reveal>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <f.icon className="size-5 text-primary-600 dark:text-primary-400" />
                <h3 className="mt-3 font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink">Simple pricing</h2>
            <p className="mt-2 text-muted">Every plan starts with a 1-year free trial. Pay yearly and get 2 months free.</p>
          </div>
          <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">
            Compare plans <ArrowRight className="size-4" />
          </Link>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <PlanCards plans={plans} />
        </Reveal>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl bg-[#18181b] px-8 py-10 ring-1 ring-white/10 sm:flex-row sm:items-center sm:px-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Move your customers in a day.</h2>
            <p className="mt-2 text-[#a1a1aa]">Import from MikroTik or Excel, connect your router and start billing.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#18181b] transition hover:bg-[#e4e4e7]">
              Start free trial
            </Link>
            <Link href="/contact" className="rounded-lg px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/10">
              Talk to us
            </Link>
          </div>
        </Reveal>
      </section>
    </SitePage>
  );
}
