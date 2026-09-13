import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nihongo Bridge — Learn Japanese",
  description:
    "Learn hiragana, katakana and essential Japanese vocabulary with spaced-repetition flashcards.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900 antialiased">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500 text-lg font-bold text-white shadow-sm">
                に
              </span>
              <span className="text-lg font-bold tracking-tight">
                Nihongo<span className="text-rose-500">Bridge</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Decks
              </Link>
              <Link
                href="/kana"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Kana Chart
              </Link>
              <Link
                href="/stats"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Progress
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-5xl px-5 py-10 text-center text-xs text-slate-400">
          Nihongo Bridge · Built with Next.js, Drizzle & PostgreSQL · がんばって！
        </footer>
      </body>
    </html>
  );
}
