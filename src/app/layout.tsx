import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_JP, Nunito } from "next/font/google";
import { JsonLd } from "@/components/seo/JsonLd";
import { Providers } from "@/components/Providers";
import { organizationLd, websiteLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/lib/seo/config";
import { seedReady } from "@/lib/seed";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto",
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = buildMetadata({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  path: "/",
});

/**
 * The root layout previously declared `force-dynamic`, which cascades to the
 * entire route tree — every page was server-rendered per request even when its
 * content was identical for all visitors. Removing it lets public pages use
 * ISR. Pages that read cookies() or headers() are still detected as dynamic
 * automatically, so authenticated routes are unaffected.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await seedReady();

  return (
    <html lang="en">
      <body className={`${nunito.variable} ${noto.variable} antialiased`}>
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
