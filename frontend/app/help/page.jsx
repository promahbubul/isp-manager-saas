import { BookOpen } from "lucide-react";
import Link from "next/link";
import { fetchList } from "@/components/marketing/Article";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";
import { site } from "@/lib/site";

export const metadata = { title: "Help Center", description: `How to set up and use ${site.name}: routers, customers, billing, SMS and payments.` };

export default async function HelpPage() {
  const articles = await fetchList("help");
  const groups = articles.reduce((m, a) => {
    const k = a.category || "General";
    (m[k] ??= []).push(a);
    return m;
  }, {});
  return (
    <SitePage>
      <PageHero eyebrow="Help Center" title="How can we help?">
        Step-by-step guides. Can&apos;t find it?{" "}
        <Link href="/faq" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
          See the FAQ
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
          contact us
        </Link>
        .
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {articles.length === 0 && <p className="text-muted">Articles are coming soon.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(groups).map(([cat, list]) => (
            <div key={cat} className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <BookOpen className="size-4 text-primary-600 dark:text-primary-400" /> {cat}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {list.map((a) => (
                  <li key={a._id}>
                    <Link href={`/help/${a.slug}`} className="text-muted transition hover:text-primary-600">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted">Logged-in ISPs can also open a request under Help &amp; Support.</p>
      </section>
    </SitePage>
  );
}
