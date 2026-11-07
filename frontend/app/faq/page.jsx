import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";

export const metadata = { title: "FAQ", description: "Common questions about ISP Manager: MikroTik, payments, SMS, data and pricing." };

const FAQ = [
  ["Which routers are supported?", "MikroTik RouterOS 6 and 7 over the RouterOS API (port 8728, or 8729 with SSL). Routers without a public IP can connect over our VPN (WireGuard for RouterOS 7, SSTP for RouterOS 6)."],
  ["Do I need to install anything?", "No. It runs in the browser. You only enable the API service on your MikroTik and add the router in the panel."],
  ["Can customers pay online?", "Yes. Connect your own SSLCommerz, bKash or Stripe merchant account, or accept bKash/Nagad Send Money with TrxID that your staff verifies. The money goes directly to your account."],
  ["What happens when a customer does not pay?", "Prepaid customers are disabled automatically after the expiry date plus your grace days, and re-enabled the moment they pay. Postpaid customers get a monthly invoice and are cut off only when an invoice is overdue."],
  ["How do SMS work?", "Buy SMS credits from us, or (Pro plan) connect your own SMS gateway such as PutulHost, Twilio, Vonage or Plivo. Welcome, payment, reminder and expiry SMS go out automatically."],
  ["Is my data safe?", "Each ISP's data is isolated. Router, payment gateway and SMS passwords are encrypted. You can export all your data at any time from Settings."],
  ["Does it keep the BTRC IP log?", "On Pro and Enterprise, PPPoE sessions (username, IP, MAC, login and logout time) are recorded every 5 minutes and can be exported to Excel."],
  ["Can my resellers use it?", "Yes. Each reseller gets a login, sees only their own customers and recharges from a prepaid balance you manage."],
  ["Is there a free trial?", "Yes, 14 days with no card needed. You can import your customers from Excel or directly from MikroTik."],
  ["How do I cancel?", "You can stop renewing at any time. See the refund policy for paid periods."],
];

export default function FaqPage() {
  return (
    <SitePage>
      <PageHero eyebrow="FAQ" title="Frequently asked questions">
        Quick answers about routers, payments, SMS and your data.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 [&>*]:max-w-3xl">
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-line bg-surface px-5 py-4 shadow-[var(--shadow-card)] open:ring-1 open:ring-primary-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-muted">
          More in the{" "}
          <Link href="/help" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Help Center
          </Link>
          , or{" "}
          <Link href="/demo" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            book a free demo
          </Link>
          .
        </p>
      </section>
    </SitePage>
  );
}
