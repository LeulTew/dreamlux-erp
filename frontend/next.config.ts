import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  env: {
    // ISOLATION: Default to the DEMO backend only. Never use the production backend URL here.
    // Production backend is backend-blush-mu-42.vercel.app (project: backend) — DO NOT use that URL here.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://el-erp-demo-backend.vercel.app",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
    ],
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://el-erp-demo-backend.vercel.app";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  // E5 fix: prevent back-button bfcache from restoring authenticated pages after logout.
  // All app routes are protected client-side, but browsers may serve bfcache copies;
  // Cache-Control: no-store forces a fresh network fetch, ensuring auth guards re-evaluate.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        ignored: ["**/node_modules/**", "**/.next/**"],
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;

