/**
 * The browser always talks to "/api/v1" on the frontend's own domain; Next forwards it to the backend.
 * Same origin → the login cookie works even when the frontend (Vercel) and the API (cPanel/VPS)
 * are on different domains, and no CORS is needed.
 * BACKEND_URL = where the API really runs, e.g. https://isp.rsitlink.com (set on Vercel, then redeploy).
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "citynet.ispms.net",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
