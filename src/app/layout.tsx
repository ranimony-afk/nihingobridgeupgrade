import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_JP, Nunito } from "next/font/google";
import { Providers } from "@/components/Providers";
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

export const metadata: Metadata = {
  title: "Nihongo Bridge — Learn Japanese like play",
  description:
    "Duolingo-style Japanese lessons with streaks, hearts, XP, stories, leagues, and a tanuki named Mochi.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  await seedReady();

  return (
    <html lang="en">
      <body className={`${nunito.variable} ${noto.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
