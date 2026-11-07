import Link from "next/link";
import { fetchList } from "@/components/marketing/Article";
import { SitePage } from "@/components/marketing/SiteLayout";

export const metadata = { title: "Blog", description: "Tips for running an ISP in Bangladesh: MikroTik, billing, BTRC and growth." };

export default async function BlogPage() {
  const posts = await fetchList("blog");
  return (
    <SitePage>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-extrabold text-zinc-900">Blog</h1>
        <p className="mt-2 text-zinc-600">Practical guides for ISP owners.</p>
        <div className="mt-10 space-y-8">
          {posts.length === 0 && <p className="text-zinc-500">No posts yet.</p>}
          {posts.map((p) => (
            <article key={p._id} className="border-b border-zinc-200 pb-6">
              <p className="text-xs text-zinc-500">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-GB") : ""}</p>
              <h2 className="mt-1 text-xl font-bold text-zinc-900">
                <Link href={`/blog/${p.slug}`} className="hover:text-primary-700">
                  {p.title}
                </Link>
              </h2>
              {p.excerpt && <p className="mt-2 text-zinc-600">{p.excerpt}</p>}
            </article>
          ))}
        </div>
      </section>
    </SitePage>
  );
}
