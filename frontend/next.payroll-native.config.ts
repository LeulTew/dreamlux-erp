import type { NextConfig } from "next";
import { payrollPublicEnvironment } from "./payroll-qa-environment";

for (const [name, expected] of Object.entries(payrollPublicEnvironment)) {
  if (process.env[name] !== expected) throw new Error("Payroll QA requires its explicit harmless public environment");
}

const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  env: { NEXT_PUBLIC_API_URL: payrollPublicEnvironment.NEXT_PUBLIC_API_URL },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "127.0.0.1", port: "5326" }],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:5326/:path*" }];
  },
  async headers() {
    return [{
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    }];
  },
};

export default config;
