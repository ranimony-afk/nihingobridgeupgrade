"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  BookOpen,
  Award,
  Zap,
  BarChart3,
  Layers,
  Languages,
  Network,
  RefreshCw,
  Sparkles,
  Trophy,
  Volume2,
  Clock,
  CalendarClock,
  ChevronDown,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [currentLevel, setCurrentLevel] = useState<string>("N5");
  const [furiganaMode, setFuriganaMode] = useState<"show" | "hover" | "hide">("show");

  // Broadcast furigana mode changes to document body/dataset
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-furigana", furiganaMode);
    }
  }, [furiganaMode]);

  const navItems = [
    { href: "/", label: "Overview", icon: Sparkles },
    { href: "/dictionary", label: "Dictionary", icon: BookOpen },
    { href: "/kana", label: "Kana Chart", icon: Languages },
    { href: "/kanji", label: "Kanji Tree", icon: Network },
    { href: "/mindtree", label: "MindTree Lab", icon: Layers },
    { href: "/jlpt/test/jlpt-n5-mock-01", label: "N5 Mock Exam", icon: Award },
    { href: "/quiz/drill", label: "Quick Drill", icon: Zap },
    { href: "/question-bank", label: "Question Bank", icon: BookOpen },
    { href: "/review/today", label: "Today", icon: CalendarClock },
    { href: "/review/personal", label: "Personalized", icon: Sparkles },
    { href: "/review", label: "SRS Review", icon: Layers },
    { href: "/review/sync", label: "Sync", icon: RefreshCw },
    { href: "/progress", label: "Progress", icon: Trophy },
    { href: "/analytics", label: "Analytics & Report", icon: BarChart3 },
  ];
  const mobileNavHrefs = new Set(["/", "/dictionary", "/kanji", "/mindtree", "/review/today"]);
  const isActiveNavItem = (href: string) => href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo & Brand */}
        <div className="flex min-w-0 items-center gap-2 xl:gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90 sm:gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-red-600 via-rose-500 to-amber-500 text-white shadow-md shadow-red-500/20 font-bold text-lg">
              橋
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                <span>Nihongo<span className="text-red-600">Bridge</span></span>
                <span className="hidden rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 sm:inline">
                  Phase 10
                </span>
              </div>
              <p className="hidden text-[11px] font-medium text-slate-700 sm:block">JLPT & Quiz Engine Core</p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav aria-label="Primary navigation" className="hidden min-w-0 max-w-[55vw] items-center gap-1 overflow-x-auto border-l border-slate-200 pl-4 xl:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveNavItem(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${
                    isActive
                      ? "bg-red-50 text-red-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-red-600" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls: Level Selector & Furigana switch */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          {/* JLPT Level Tag */}
          <div className="hidden items-center rounded-lg border border-slate-200 bg-slate-50 p-1 xl:flex">
            {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={currentLevel === lvl}
                onClick={() => setCurrentLevel(lvl)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                  currentLevel === lvl
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
                title={`JLPT ${lvl} Level`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Furigana Mode Toggle */}
          <button
            onClick={() => {
              const nextMode =
                furiganaMode === "show"
                  ? "hover"
                  : furiganaMode === "hover"
                  ? "hide"
                  : "show";
              setFuriganaMode(nextMode);
            }}
            aria-label={`Furigana reading aids: ${furiganaMode}. Activate to change mode.`}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:px-2.5"
            title="Toggle Furigana reading aids (Show / On Hover / Hide)"
          >
            <span className="font-japanese text-sm text-red-600 font-bold">ふ</span>
            <span className="capitalize hidden sm:inline">{furiganaMode}</span>
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-2 sm:px-6 lg:px-8 xl:hidden">
        <div className="relative -mx-4 flex items-center gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-1">
            {navItems.filter((item) => mobileNavHrefs.has(item.href)).map((item) => {
              const isActive = isActiveNavItem(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1 ${isActive ? "bg-red-50 text-red-800" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <fieldset className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-3">
            <legend className="sr-only">Select JLPT level</legend>
            {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={currentLevel === lvl}
                onClick={() => setCurrentLevel(lvl)}
                className={`min-h-10 min-w-10 rounded-lg px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${currentLevel === lvl ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {lvl}
              </button>
            ))}
          </fieldset>
        </div>
      </div>
    </header>
  );
}
