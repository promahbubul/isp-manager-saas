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
};

export default nextConfig;
