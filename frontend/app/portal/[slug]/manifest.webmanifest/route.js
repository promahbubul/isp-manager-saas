import { API_URL } from "@/lib/api";

/** Per-ISP web app manifest: "Add to home screen" opens this ISP's portal with its name and colour. */
export async function GET(_req, { params }) {
  const { slug } = await params;
  let isp = null;
  try {
    const r = await fetch(`${API_URL}/portal/isp/${encodeURIComponent(slug)}`, { next: { revalidate: 3600 } });
    if (r.ok) isp = (await r.json()).data;
  } catch {
    /* fall back to a generic manifest */
  }
  const name = isp?.name ?? "My Internet";
  const manifest = {
    name: `${name} — My account`,
    short_name: name.slice(0, 12),
    start_url: `/portal/${slug}/account`,
    scope: `/portal/${slug}/`,
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: isp?.primaryColor || "#7e22ce",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
