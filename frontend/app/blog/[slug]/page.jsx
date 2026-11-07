import { ArticlePage, fetchContent } from "@/components/marketing/Article";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await fetchContent(`/posts/${slug}`);
  return p ? { title: p.title, description: p.excerpt } : { title: "Not found" };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  return <ArticlePage slug={slug} back={{ href: "/blog", label: "All posts" }} />;
}
