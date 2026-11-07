import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/marketing/SiteLayout";
import { API_URL } from "@/lib/api";

/** Server-side fetch of published blog/help content (cached 5 minutes). */
export async function fetchContent(path) {
  try {
    const r = await fetch(`${API_URL}/public/content${path}`, { next: { revalidate: 300 } });
    if (!r.ok) return null;
    return (await r.json()).data;
  } catch {
    return null;
  }
}

export async function fetchList(type, params = "") {
  try {
    const r = await fetch(`${API_URL}/public/content/posts?type=${type}&limit=100${params}`, { next: { revalidate: 300 } });
    if (!r.ok) return [];
    return (await r.json()).data ?? [];
  } catch {
    return [];
  }
}

/**
 * Minimal, safe renderer: "# " / "## " headings, "- " lists, blank-line paragraphs.
 * Text is rendered as text (no HTML injection).
 */
export function ArticleBody({ body }) {
  const blocks = String(body ?? "").replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-relaxed text-zinc-700">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (b.startsWith("## ")) return <h3 key={i} className="pt-2 text-xl font-bold text-zinc-900">{b.slice(3)}</h3>;
        if (b.startsWith("# ")) return <h2 key={i} className="pt-2 text-2xl font-bold text-zinc-900">{b.slice(2)}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\d+\. /, "")}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        );
      })}
    </div>
  );
}

/** Shared by /blog/[slug] and /help/[slug]. */
export async function ArticlePage({ slug, back }) {
  const p = await fetchContent(`/posts/${slug}`);
  if (!p) notFound();
  return (
    <SitePage>
      <article className="mx-auto max-w-6xl px-4 py-14 sm:px-6 [&>*]:max-w-3xl">
        <Link href={back.href} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
          ← {back.label}
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{p.title}</h1>
        {p.publishedAt && <p className="mt-2 text-sm text-zinc-500">{new Date(p.publishedAt).toLocaleDateString("en-GB")}</p>}
        <div className="mt-8">
          <ArticleBody body={p.body} />
        </div>
      </article>
    </SitePage>
  );
}
