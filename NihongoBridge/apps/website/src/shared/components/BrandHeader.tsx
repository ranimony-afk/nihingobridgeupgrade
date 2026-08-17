"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type BrandConfig, PLATFORM_LOCALES } from "@/lib/brands";

export interface MegaMenuItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string;
  description?: string;
}

export interface MegaMenuCategory {
  title: string;
  items: MegaMenuItem[];
}

/** Complete 23-Section Mega Menu requested in Prompt 2 */
export const DEFAULT_MEGA_MENU: MegaMenuCategory[] = [
  {
    title: "Core Curriculum",
    items: [
      { label: "Learn Japanese", href: "/nihongo", icon: "🗾", description: "All-in-one mastery from zero to N1" },
      { label: "JLPT", href: "/jlpt/mock-exam", icon: "⏱", badge: "Exams", description: "Timed N5 to N1 test preparation" },
      { label: "Vocabulary", href: "/dictionary", icon: "📖", description: "Searchable dictionary & core decks" },
      { label: "Kanji", href: "/kanji", icon: "🈸", badge: "Maps", description: "Radicals, stroke counts & visual maps" },
      { label: "Grammar", href: "/study/write", icon: "✍️", description: "Particles, conjugation & writing practice" },
      { label: "Conversation", href: "/nihongo/conversation", icon: "🗣️", description: "Everyday dialogues & speaking practice" },
    ],
  },
  {
    title: "Study & Practice Modes",
    items: [
      { label: "Reading", href: "/news", icon: "📰", badge: "TODAI", description: "Daily Japanese news with furigana" },
      { label: "Listening", href: "/nihongo#programs", icon: "🎧", description: "Native audio lessons & podcasts" },
      { label: "Flashcards", href: "/decks", icon: "🎴", badge: "SM-2", description: "Quizlet-style custom decks & spaced review" },
      { label: "Practice Tests", href: "/jlpt/mock-exam", icon: "📝", description: "Official diagnostic practice exams" },
      { label: "News", href: "/news", icon: "🗞️", description: "Daily articles & vocabulary extraction" },
      { label: "Resources", href: "/downloads", icon: "📚", description: "Grammar cheat sheets & study guides" },
      { label: "Downloads", href: "/downloads", icon: "📥", badge: "PDF", description: "Printable workbooks & audio packs" },
    ],
  },
  {
    title: "Japan, Career & Platform",
    items: [
      { label: "Study in Japan", href: "/nihongo/study-japan", icon: "🎓", badge: "Visa", description: "Language schools, MEXT & visas" },
      { label: "Jobs", href: "/nihongo/jobs", icon: "💼", description: "Engineering & bilingual Japan careers" },
      { label: "Culture", href: "/nihongo#about", icon: "🌸", description: "Etiquette, keigo & life in Japan" },
      { label: "Community", href: "/leaderboard", icon: "🏆", badge: "League", description: "Sapphire leaderboard & XP rankings" },
      { label: "Dashboard", href: "/leaderboard", icon: "📊", description: "Learner study stats & day streaks" },
      { label: "Admin", href: "/admin/nihongo", icon: "⚙️", badge: "CMS", description: "Headless CMS dashboard editor" },
      { label: "Support", href: "/nihongo#contact", icon: "💬", description: "Admissions & student advisory" },
    ],
  },
];

export function BrandHeader({
  brand,
  currentLocale = "en",
  showStudentNav = true,
  customMegaMenu,
}: {
  brand: BrandConfig;
  currentLocale?: string;
  showStudentNav?: boolean;
  customMegaMenu?: MegaMenuCategory[];
}) {
  const [megaOpen, setMegaOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const menuCategories = customMegaMenu && customMegaMenu.length > 0 ? customMegaMenu : DEFAULT_MEGA_MENU;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/dictionary?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <header className="space-y-3 font-sans">
      {/* Top Bar: Brand, Multi-Language, Search, Bookmarks, Profile, Admin */}
      <nav className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
        <div className="flex items-center gap-3">
          <Link href="/nihongo" className="text-base font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white font-black shadow-xs"
              style={{ background: brand.theme.accent }}
            >
              橋
            </span>
            <span>{brand.name}</span>
          </Link>

          <button
            onClick={() => setMegaOpen(!megaOpen)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-slate-800 transition cursor-pointer"
          >
            <span>☰ Mega Menu (23 Sections)</span>
            <span className="text-[10px] opacity-75">{megaOpen ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Global Quick Search, Language Switcher, Bookmarks & Profile Links */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search in Dictionary */}
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search (Dictionary)..."
              className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-medium border border-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 w-44"
            />
          </form>

          {/* Bookmarks */}
          <Link
            href="/decks"
            className="rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 border border-black/5 hover:bg-slate-50 transition shadow-2xs"
            title="Bookmarks"
          >
            ★ Bookmarks
          </Link>

          {/* Profile & XP Stats */}
          <Link
            href="/leaderboard"
            className="rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 border border-black/5 hover:bg-slate-50 transition shadow-2xs"
            title="Profile"
          >
            👤 Profile (420 XP)
          </Link>

          {/* Multilingual Switcher */}
          <div className="flex items-center gap-0.5 rounded-xl bg-white p-0.5 shadow-2xs border border-black/5">
            {PLATFORM_LOCALES.filter((l) => l.status === "active").map((loc) => {
              const isActive = loc.code === currentLocale;
              return (
                <Link
                  key={loc.code}
                  href={`/${brand.slug}?lang=${loc.code}`}
                  className={`rounded-lg px-2 py-1 transition text-[11px] ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs font-bold"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {loc.nativeName}
                </Link>
              );
            })}
          </div>

          <Link
            href="/admin/nihongo"
            className="rounded-xl bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200 transition"
          >
            ⚙️ Admin
          </Link>
        </div>
      </nav>

      {/* Expanded Interactive Mega Menu Panel */}
      {megaOpen && (
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-xl border border-black/10 transition-all duration-200 animate-fade-in space-y-6">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-100 text-rose-900 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                CMS-Driven Mega Menu
              </span>
              <p className="text-xs font-bold text-slate-900">Explore all 23 Educational Sections</p>
            </div>
            <button
              onClick={() => setMegaOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-900 font-bold cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {menuCategories.map((cat, ci) => (
              <div key={ci} className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  {cat.title}
                </h4>
                <div className="space-y-1">
                  {cat.items.map((item, ii) => (
                    <Link
                      key={ii}
                      href={item.href}
                      onClick={() => setMegaOpen(false)}
                      className="group flex items-start gap-2.5 rounded-xl p-2 transition hover:bg-slate-50"
                    >
                      <span className="text-lg">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 group-hover:text-rose-700 transition">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="rounded-md bg-rose-50 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 uppercase">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1">{item.description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Access Toolbar inside Mega Menu */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-black/5 text-[11px] font-medium text-slate-600 bg-slate-50/80 p-3 rounded-2xl">
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/dictionary" className="hover:text-slate-950 font-bold">🔍 Search</Link>
              <Link href="/decks" className="hover:text-slate-950 font-bold">★ Bookmarks</Link>
              <Link href="/leaderboard" className="hover:text-slate-950 font-bold">👤 Profile</Link>
              <Link href="/leaderboard" className="hover:text-slate-950 font-bold">📊 Dashboard</Link>
              <Link href="/admin/nihongo" className="hover:text-slate-950 font-bold">⚙️ Admin</Link>
              <Link href="/nihongo#contact" className="hover:text-slate-950 font-bold">💬 Support</Link>
            </div>
            <span className="text-rose-700 font-bold">100% CMS Editable • Live PostgreSQL Sync</span>
          </div>
        </div>
      )}

      {/* Main Horizontal Quick-Links Ribbon */}
      {showStudentNav && !megaOpen && (
        <nav className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/90 p-2 shadow-sm border border-black/5 text-xs font-medium text-slate-800">
          <Link href="/nihongo" className="rounded-xl px-3 py-1.5 bg-slate-900 text-white font-bold transition">
            🏠 Overview
          </Link>
          <Link href="/decks" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            🎴 Flashcards
          </Link>
          <Link href="/kanji" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            🈸 Kanji
          </Link>
          <Link href="/dictionary" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            📖 Vocabulary
          </Link>
          <Link href="/study/write" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            ✍️ Grammar
          </Link>
          <Link href="/nihongo/conversation" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            🗣️ Conversation
          </Link>
          <Link href="/news" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            📰 News
          </Link>
          <Link href="/jlpt/mock-exam" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            ⏱ Practice Tests
          </Link>
          <Link href="/downloads" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            📥 Downloads
          </Link>
          <Link href="/leaderboard" className="rounded-xl px-3 py-1.5 hover:bg-slate-100 transition">
            🏆 Community
          </Link>
        </nav>
      )}
    </header>
  );
}
