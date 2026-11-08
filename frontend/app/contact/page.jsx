import { Building2, Clock, FileBadge, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  const items = [
    [Building2, "Company", site.legalName],
    [MapPin, "Office", site.address],
    [Phone, "Phone", site.phone, `tel:${site.phone}`],
    [Mail, "Email", site.email, `mailto:${site.email}`],
    ...(site.tradeLicense ? [[FileBadge, "Trade licence", site.tradeLicense]] : []),
    [Clock, "Support hours", "Saturday – Thursday, 10:00 – 19:00"],
  ];
  return (
    <SitePage>
      <PageHero eyebrow="Contact" title="We are happy to help">
        Sales, support or billing questions — reach us any way you like.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([Icon, k, v, href]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <Icon className="size-5 text-primary-600 dark:text-primary-400" />
              <dt className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
              <dd className="mt-1 break-words font-medium text-ink">{href ? <a href={href} className="hover:text-primary-700 hover:underline">{v}</a> : v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-muted">
          Want to try it yourself?{" "}
          <Link href="/signup" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Start your free trial
          </Link>
          .
        </p>
      </section>
    </SitePage>
  );
}
