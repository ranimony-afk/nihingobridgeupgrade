import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modern formats are 25–35% smaller than JPEG at equivalent quality.
  images: {
    formats: ["image/avif", "image/webp"],
    // Remote art is hotlinked from Pexels; without this next/image refuses it.
    remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Import only the used members of these packages instead of the whole barrel.
  experimental: {
    optimizePackageImports: ["d3", "drizzle-orm"],
  },

  compiler: {
    // Strip console noise in production, but keep errors and warnings.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  poweredByHeader: false,
  compress: true,

  async headers() {
    return [
      {
        // Fingerprinted build assets are immutable.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
