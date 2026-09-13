import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` is a native-ish Node driver: keep it external so the serverless
  // bundle does not try to inline it (common Vercel deployment failure).
  serverExternalPackages: ["pg"],
  // The knowledge pages are always rendered per request against PostgreSQL.
  experimental: {
    staleTimes: { dynamic: 0, static: 180 },
  },
  logging: {
    fetches: { fullUrl: false },
  },
};

export default nextConfig;
