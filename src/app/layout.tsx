import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "NihongoBridge — Japanese knowledge platform",
  description:
    "Kanji mind trees, radicals, components, vocabulary and JLPT study built on a single knowledge graph.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/kanji", label: "Kanji" },
  { href: "/grammar", label: "Grammar" },
  { href: "/dictionary", label: "Dictionary" },
  { href: "/courses", label: "Courses" },
  { href: "/dashboard", label: "Progress" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="jp-glyph grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-lg text-white">
                橋
              </span>
              <span className="text-base font-semibold tracking-tight text-slate-900">
                NihongoBridge
              </span>
            </Link>
            <nav className="flex flex-1 items-center gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 md:inline">
              Knowledge graph · EDRDG data
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mt-16 border-t border-slate-200/70 py-8">
          <div className="mx-auto max-w-7xl px-4 text-xs text-slate-500 sm:px-6">
            Kanji, radical and decomposition data from KANJIDIC2 / KRADFILE / RADKFILE;
            vocabulary from JMdict — all © EDRDG, used under the EDRDG licence
            (CC BY-SA compatible). See <code>docs/PROVENANCE.md</code>.
          </div>
        </footer>
      </body>
    </html>
  );
}
