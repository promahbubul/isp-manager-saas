import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { fetchList } from "@/components/marketing/Article";
import { PageHero, SitePage } from "@/components/marketing/SiteLayout";

export const metadata = { title: "Blog", description: "Tips for running an ISP in Bangladesh: MikroTik, billing, BTRC and growth." };

export default async function BlogPage() {
  const posts = await fetchList("blog");
  return (
    <SitePage>
      <PageHero eyebrow="Blog" title="Guides for ISP owners">
        Practical tips on MikroTik, billing, BTRC and growing your network.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {posts.length === 0 && <p className="text-muted">No posts yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <Link
              key={p._id}
              href={`/blog/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg"
            >
              <p className="text-xs text-muted">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-GB") : ""}</p>
              <h2 className="mt-2 text-lg font-semibold text-ink group-hover:text-primary-600">{p.title}</h2>
              {p.excerpt && <p className="mt-2 flex-1 text-sm text-muted">{p.excerpt}</p>}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                Read more <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </SitePage>
  );
}
