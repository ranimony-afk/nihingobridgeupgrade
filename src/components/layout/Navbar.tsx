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
    { href: "/kana", label: "Kana Chart", icon: Languages },
    { href: "/kanji", label: "Kanji Tree", icon: Network },
    { href: "/jlpt/test/jlpt-n5-mock-01", label: "N5 Mock Exam", icon: Award },
    { href: "/quiz/drill", label: "Quick Drill", icon: Zap },
    { href: "/question-bank", label: "Question Bank", icon: BookOpen },
    { href: "/review/today", label: "Today", icon: CalendarClock },
    { href: "/review/personal", label: "Personalized", icon: Sparkles },
    { href: "/review", label: "SRS Review", icon: Layers },
    { href: "/review/sync", label: "Sync", icon: RefreshCw },
    { href: "/analytics", label: "Analytics & Report", icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-red-600 via-rose-500 to-amber-500 text-white shadow-md shadow-red-500/20 font-bold text-lg">
              橋
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-slate-900 tracking-tight text-lg">
                <span>Nihongo<span className="text-red-600">Bridge</span></span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  Phase 10
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-700">JLPT & Quiz Engine Core</p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-200">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
        <div className="flex items-center gap-3">
          {/* JLPT Level Tag */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setCurrentLevel(lvl)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
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
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            title="Toggle Furigana reading aids (Show / On Hover / Hide)"
          >
            <span className="font-japanese text-sm text-red-600 font-bold">ふ</span>
            <span className="capitalize hidden sm:inline">{furiganaMode}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
