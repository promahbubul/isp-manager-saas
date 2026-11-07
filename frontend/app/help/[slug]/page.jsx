import { ArticlePage, fetchContent } from "@/components/marketing/Article";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await fetchContent(`/posts/${slug}`);
  return p ? { title: `${p.title} — Help`, description: p.excerpt } : { title: "Not found" };
}

export default async function HelpArticlePage({ params }) {
  const { slug } = await params;
  return <ArticlePage slug={slug} back={{ href: "/help", label: "Help Center" }} />;
}
