import { SitePage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <SitePage>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-extrabold text-zinc-900">Contact us</h1>
        <p className="mt-3 text-zinc-600">Sales, support, demo or billing questions — we are happy to help.</p>
        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          {[
            ["Company", site.legalName],
            ["Office", site.address],
            ["Phone", site.phone],
            ["Email", site.email],
            ["Trade licence", site.tradeLicense],
            ["Support hours", "Saturday – Thursday, 10:00 – 19:00"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-200 p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">{k}</dt>
              <dd className="mt-1 font-medium text-zinc-900">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </SitePage>
  );
}
