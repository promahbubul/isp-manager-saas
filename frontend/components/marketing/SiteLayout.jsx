import Link from "next/link";
import { site } from "@/lib/site";
import SiteHeader, { Logo } from "./SiteHeader";

export { SiteHeader };

const FOOTER = [
  {
    title: "Product",
    links: [
      ["/#features", "Features"],
      ["/pricing", "Pricing"],
      ["/demo", "Book a demo"],
      ["/signup", "Free trial"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["/help", "Help Center"],
      ["/blog", "Blog"],
      ["/faq", "FAQ"],
      ["/contact", "Contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/terms", "Terms & Conditions"],
      ["/privacy", "Privacy Policy"],
      ["/refund-policy", "Refund & Cancellation"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="text-sm text-muted">
          <Logo />
          <p className="mt-4 max-w-xs">ISP billing, MikroTik automation and customer management for Bangladesh.</p>
          <p className="mt-4">{site.address}</p>
          <p className="mt-1">{site.phone}</p>
          <p className="mt-1">{site.email}</p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-ink">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-muted transition hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Payments: SSLCommerz (Visa, Mastercard, bKash, Nagad, Rocket) · bKash · Stripe</p>
        </div>
      </div>
    </footer>
  );
}

export function SitePage({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Centered page title block used by the inner marketing pages. */
export function PageHero({ eyebrow, title, children }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow && <p className="animate-pop-in text-sm font-medium text-primary-600 dark:text-primary-400">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl animate-pop-in text-4xl font-semibold tracking-tight text-ink [animation-delay:80ms] sm:text-5xl">{title}</h1>
        {children && <div className="mt-4 max-w-2xl animate-pop-in text-lg text-muted [animation-delay:160ms]">{children}</div>}
      </div>
    </section>
  );
}

/** Wrapper for long legal text. */
export function LegalPage({ title, updated, children }) {
  return (
    <SitePage>
      <PageHero eyebrow="Legal" title={title}>
        <p className="text-sm">Last updated: {updated}</p>
      </PageHero>
      <article className="mx-auto max-w-6xl px-4 py-12 leading-relaxed [&>*]:max-w-3xl text-ink sm:px-6 [&_a]:text-primary-600 [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-muted [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-muted">
        {children}
      </article>
    </SitePage>
  );
}
