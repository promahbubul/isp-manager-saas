import Link from "next/link";
import { fetchList } from "@/components/marketing/Article";
import { SitePage } from "@/components/marketing/SiteLayout";

export const metadata = { title: "Help Center", description: "How to set up and use ISP Manager: routers, customers, billing, SMS and payments." };

export default async function HelpPage() {
  const articles = await fetchList("help");
  const groups = articles.reduce((m, a) => {
    const k = a.category || "General";
    (m[k] ??= []).push(a);
    return m;
  }, {});
  return (
    <SitePage>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-extrabold text-zinc-900">Help Center</h1>
        <p className="mt-2 text-zinc-600">
          Step-by-step guides. Can&apos;t find it? <Link href="/faq" className="text-primary-700 hover:underline">See the FAQ</Link> or{" "}
          <Link href="/contact" className="text-primary-700 hover:underline">contact us</Link>. Logged-in ISPs can also open a request under Help &amp; Support.
        </p>
        {articles.length === 0 && <p className="mt-10 text-zinc-500">Articles are coming soon.</p>}
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {Object.entries(groups).map(([cat, list]) => (
            <div key={cat}>
              <h2 className="text-lg font-bold text-zinc-900">{cat}</h2>
              <ul className="mt-3 space-y-2">
                {list.map((a) => (
                  <li key={a._id}>
                    <Link href={`/help/${a.slug}`} className="text-primary-700 hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </SitePage>
  );
}
