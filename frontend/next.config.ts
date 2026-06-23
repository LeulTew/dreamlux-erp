import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

