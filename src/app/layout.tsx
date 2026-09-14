import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: "NihongoBridge — Japanese Learning & JLPT Exam Simulator",
  description:
    "Production-grade Japanese learning platform with generic quiz engine, JLPT N5-N1 mock exams, question bank, and diagnostic analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" data-furigana="show">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@600;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50/50 text-slate-900 font-sans antialiased flex flex-col selection:bg-red-500 selection:text-white">
        <Navbar />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-7xl px-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-semibold text-slate-700">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-[10px] text-white">
                橋
              </span>
              NihongoBridge Platform — Phase 10 Production Target
            </div>
            <p>© 2026 NihongoBridge. Standard JLPT N5–N1 Architecture.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
