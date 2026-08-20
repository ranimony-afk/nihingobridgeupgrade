import type { MetadataRoute } from "next";
import { PRIVATE_PREFIXES, canonical } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  const disallow = [...PRIVATE_PREFIXES];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Search result pages are thin and near-duplicate; keep them out.
        disallow: [...disallow, "/search?"],
      },
      // Googlebot-News and Discover benefit from an explicit large-image allow.
      { userAgent: "Googlebot", allow: "/", disallow },
      { userAgent: "Googlebot-Image", allow: "/images/", disallow },
    ],
    sitemap: canonical("/sitemap.xml"),
    host: canonical("/"),
  };
}
