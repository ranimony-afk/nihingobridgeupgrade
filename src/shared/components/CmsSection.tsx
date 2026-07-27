import React from "react";
import type { BrandConfig } from "@/lib/brands";
import { sectionKindFor } from "@/shared/cms";

export interface CmsCardItem {
  image?: string;
  title: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  ctaHref?: string;
  category?: string;
  tags?: string[];
  status?: string;
  scheduledDate?: string;
  author?: string;
  quote?: string;
  stats?: string;
  japanese?: string;
  furigana?: string;
  meaning?: string;
  strokeCount?: number;
  q?: string;
  a?: string;
  href?: string;
  size?: string;
}

export interface CmsSectionData {
  id: number;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  status: string;
  content: Record<string, unknown>;
}

export function CmsSection({
  section,
  brand,
  preview = false,
}: {
  section: CmsSectionData;
  brand: BrandConfig;
  preview?: boolean;
}) {
  const c = section.content ?? {};
  const kind = sectionKindFor(section.sectionKey);
  const items = Array.isArray(c.items) ? (c.items as CmsCardItem[]) : null;

  return (
    <section
      id={section.sectionKey}
      className="rounded-3xl bg-white/85 p-6 sm:p-8 shadow-sm border border-black/5 space-y-4"
      data-cms-key={section.sectionKey}
      data-cms-kind={kind}
      data-cms-status={section.status}
    >
      {/* Editorial Status & Category Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {preview && section.status !== "published" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              {section.status}
            </span>
          )}
          {Boolean(c.category) && (
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              {String(c.category)}
            </span>
          )}
        </div>

        {Boolean(c.scheduledDate) && (
          <span className="text-[11px] font-semibold text-slate-500">
            📅 {String(c.scheduledDate)}
          </span>
        )}
      </div>

      {/* Section Titles */}
      {section.title && (
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: brand.theme.primary }}>
          {section.title}
        </h2>
      )}
      {section.subtitle && (
        <p className="text-sm font-medium opacity-75 max-w-2xl">{section.subtitle}</p>
      )}

      {/* Section Content Body */}
      {Boolean(c.body) && <p className="text-sm opacity-85 leading-relaxed">{String(c.body)}</p>}

      {/* 1. Announcement Bar */}
      {kind === "announcement" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 border border-rose-200/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-rose-600 px-2 py-0.5 font-bold text-white uppercase text-[10px]">
              {String(c.badge ?? "NEW")}
            </span>
            <span className="font-semibold text-slate-900">{String(c.message ?? section.title)}</span>
          </div>
          {Boolean(c.ctaHref) && (
            <a href={String(c.ctaHref)} className="font-bold text-rose-700 hover:underline">
              {String(c.ctaText ?? "Learn More →")}
            </a>
          )}
        </div>
      )}

      {/* 2. Countdown Clock Box */}
      {kind === "countdown" && (
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-rose-950 p-6 text-white text-center space-y-4">
          <p className="text-xs uppercase font-bold tracking-widest text-rose-300">
            {String(c.examName ?? "Next Official JLPT Exam")}
          </p>
          <div className="grid grid-cols-4 gap-2 max-w-xs mx-auto text-center">
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-2xl font-bold">{String(c.days ?? "114")}</p>
              <p className="text-[10px] uppercase opacity-70">Days</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-2xl font-bold">{String(c.hours ?? "18")}</p>
              <p className="text-[10px] uppercase opacity-70">Hours</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-2xl font-bold">{String(c.minutes ?? "42")}</p>
              <p className="text-[10px] uppercase opacity-70">Mins</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-2xl font-bold">{String(c.seconds ?? "09")}</p>
              <p className="text-[10px] uppercase opacity-70">Secs</p>
            </div>
          </div>
          {Boolean(c.ctaHref) && (
            <a
              href={String(c.ctaHref)}
              className="inline-block rounded-xl px-6 py-2.5 text-xs font-bold text-white transition hover:opacity-90"
              style={{ background: brand.theme.accent }}
            >
              {String(c.ctaText ?? "Register for Mock Test →")}
            </a>
          )}
        </div>
      )}

      {/* 3. Reusable Structured Cards Grid (for courses, articles, learning paths, partners, downloads, spotlight, events) */}
      {items && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="group flex flex-col justify-between rounded-2xl bg-white p-5 shadow-2xs border border-black/5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="space-y-2">
                {/* Category & Tags Header */}
                <div className="flex flex-wrap items-center justify-between text-[11px] gap-1">
                  {it.category && (
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                      {it.category}
                    </span>
                  )}
                  {it.scheduledDate && (
                    <span className="text-slate-400 text-[10px]">📅 {it.scheduledDate}</span>
                  )}
                </div>

                {/* Japanese / Kanji display if present */}
                {it.japanese && (
                  <div className="text-center py-2 bg-slate-50 rounded-xl">
                    <p className="text-3xl font-bold text-slate-950">{it.japanese}</p>
                    {it.furigana && <p className="text-xs text-rose-600 font-medium">{it.furigana}</p>}
                    {it.meaning && <p className="text-xs text-slate-700 mt-1">{it.meaning}</p>}
                  </div>
                )}

                {/* Card Title & Subtitle */}
                {it.title && (
                  <h3 className="font-bold text-slate-950 group-hover:text-rose-700 transition text-base">
                    {it.title}
                  </h3>
                )}
                {it.subtitle && <p className="text-xs font-medium text-slate-700">{it.subtitle}</p>}
                {it.description && <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{it.description}</p>}

                {/* Q&A for FAQs */}
                {it.q && <p className="font-bold text-sm text-slate-900">{it.q}</p>}
                {it.a && <p className="text-xs text-slate-600 mt-1">{it.a}</p>}

                {/* Testimonial Quote */}
                {it.quote && (
                  <blockquote className="border-l-2 pl-3 text-xs italic text-slate-700" style={{ borderColor: brand.theme.accent }}>
                    “{it.quote}” {it.author && <span className="block not-italic font-bold text-slate-900 mt-1">— {it.author}</span>}
                  </blockquote>
                )}

                {/* Tags */}
                {Array.isArray(it.tags) && it.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {it.tags.map((t, ti) => (
                      <span key={ti} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card CTA Action Button */}
              {(it.ctaHref || it.href) && (
                <div className="mt-4 border-t border-black/5 pt-3 flex items-center justify-between text-xs">
                  {it.size && <span className="text-slate-400 text-[10px]">{it.size}</span>}
                  <a
                    href={it.ctaHref || it.href}
                    className="font-bold text-rose-700 hover:underline inline-flex items-center gap-1 ml-auto"
                  >
                    {it.ctaText || "Explore"} →
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 4. Newsletter Box */}
      {kind === "newsletter" && (
        <form className="flex flex-col sm:flex-row gap-2 max-w-md pt-2">
          <input
            type="email"
            placeholder="Enter your email for daily JLPT tips..."
            className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-medium border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs"
            style={{ background: brand.theme.accent }}
          >
            {String(c.ctaText ?? "Subscribe")}
          </button>
        </form>
      )}

      {/* 5. Partner Logos Strip */}
      {kind === "logos" && Array.isArray(c.logos) && (
        <div className="flex flex-wrap items-center justify-around gap-6 pt-2 opacity-75">
          {(c.logos as Array<{ name: string }>).map((lg, li) => (
            <span key={li} className="text-xs font-bold uppercase tracking-widest text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg bg-slate-50">
              {lg.name}
            </span>
          ))}
        </div>
      )}

      {/* 6. Hero Layout Section */}
      {kind === "hero" && (
        <div className="rounded-3xl p-8 sm:p-12 space-y-6 bg-slate-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-950/20 to-slate-950/40 pointer-events-none" />
          <div className="relative z-1 space-y-4">
            <span
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white inline-block"
              style={{ background: brand.theme.accent }}
            >
              {String(c.badge ?? "JLPT N5 – N1 Ready")}
            </span>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              {section.title ?? brand.name}
            </h1>
            <p className="max-w-2xl text-sm sm:text-base opacity-90 leading-relaxed">
              {section.subtitle ?? "Your bridge to fluent Japanese and life in Japan."}
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 pt-4">
              {Boolean(c.ctaHref) && (
                <a
                  href={String(c.ctaHref)}
                  className="rounded-xl px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                  style={{ background: brand.theme.accent }}
                >
                  {String(c.ctaText ?? "Get Started")}
                </a>
              )}
              {Array.isArray(c.secondaryButtons) ? (
                (c.secondaryButtons as Array<{ label: string; href: string }>).map((btn, bi) => (
                  <a
                    key={bi}
                    href={btn.href}
                    className="rounded-xl bg-white/10 border border-white/20 px-6 py-3 text-xs font-bold text-white hover:bg-white/20 transition"
                  >
                    {btn.label}
                  </a>
                ))
              ) : (
                <>
                  <a
                    href="/study/flashcards"
                    className="rounded-xl bg-white/10 border border-white/20 px-6 py-3 text-xs font-bold text-white hover:bg-white/20 transition"
                  >
                    Start Free Flashcards 🎴
                  </a>
                  <a
                    href="/jlpt/mock-exam"
                    className="rounded-xl bg-white/10 border border-white/20 px-6 py-3 text-xs font-bold text-white hover:bg-white/20 transition"
                  >
                    Take JLPT Mock Exam ⏱
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. About / Vision / Mission / Founder / Admissions Layout */}
      {["about", "vision", "mission", "founder", "admissions"].includes(section.sectionKey) && (
        <div className="grid gap-6 md:grid-cols-2 pt-2 items-center">
          <div className="space-y-4">
            {Boolean(c.badge) && (
              <span className="rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                {String(c.badge)}
              </span>
            )}
            <h3 className="text-xl font-bold text-slate-900">{section.title}</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {section.subtitle || String(c.body ?? "")}
            </p>
            {Boolean(c.ctaHref) && (
              <a href={String(c.ctaHref)} className="inline-block font-bold text-rose-700 hover:underline text-xs">
                {String(c.ctaText ?? "Learn more")} &rarr;
              </a>
            )}
          </div>
          {Boolean(c.imageUrl) && (
            <div className="relative h-64 rounded-2xl overflow-hidden shadow-sm border border-black/5 bg-slate-100">
              <img src={String(c.imageUrl)} alt={section.title || "CMS Content"} className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}

      {/* 8. Statistics & Achievements Layout */}
      {(section.sectionKey === "statistics" || section.sectionKey === "achievements") && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 pt-2">
          {items ? items.map((it, idx) => (
            <div key={idx} className="rounded-2xl bg-slate-50 p-5 border border-black/5 text-center">
              <p className="text-3xl font-extrabold text-rose-700" style={{ color: brand.theme.accent }}>{it.stats || it.title}</p>
              <p className="text-xs font-bold text-slate-900 mt-1">{it.subtitle || it.japanese}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{it.description}</p>
            </div>
          )) : (
            <div className="col-span-full rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
              Configure items list with "stats", "subtitle", and "description" to display achievements cards.
            </div>
          )}
        </div>
      )}

      {/* 9. Gallery Layout */}
      {section.sectionKey === "gallery" && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 pt-2">
          {items ? items.map((it, idx) => (
            <div key={idx} className="group relative h-48 rounded-2xl overflow-hidden shadow-sm border border-black/5 bg-slate-50">
              <img src={it.image || "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80"} alt={it.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4 flex flex-col justify-end text-white">
                <h4 className="font-bold text-xs">{it.title}</h4>
                {it.description && <p className="text-[10px] opacity-80 line-clamp-1">{it.description}</p>}
              </div>
            </div>
          )) : (
            <div className="col-span-full rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
              Configure items list with "image", "title", and "description" to display the gallery.
            </div>
          )}
        </div>
      )}

      {/* 10. Social Links Layout */}
      {section.sectionKey === "social_links" && (
        <div className="flex flex-wrap gap-3 pt-2">
          {items ? items.map((it, idx) => (
            <a
              key={idx}
              href={it.href || it.ctaHref}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs flex items-center gap-2"
            >
              <span>{it.category || "🌐"}</span>
              <span>{it.title}</span>
            </a>
          )) : (
            <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400 w-full">
              Configure items list with "title", "href", and "category" (icon emoji) for social links.
            </div>
          )}
        </div>
      )}

      {/* 11. Contact Information / Privacy / Terms / Cookie Policy Layout */}
      {["contact", "privacy_policy", "terms_of_service", "cookie_policy"].includes(section.sectionKey) && (
        <div className="space-y-4 pt-2">
          <div className="rounded-2xl bg-slate-50 p-6 border border-black/5 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">{section.title}</h3>
            {section.subtitle && <p className="text-xs text-slate-600 font-medium">{section.subtitle}</p>}
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
              {String(c.body ?? "")}
            </p>
            {items && items.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-xl bg-white p-4 border border-black/5 text-xs">
                    <p className="font-bold text-slate-900">{it.title}</p>
                    <p className="text-slate-600 mt-1">{it.description}</p>
                    {it.href && (
                      <a href={it.href} className="text-rose-700 font-bold hover:underline block mt-2">
                        {it.ctaText || "Connect"} &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 12. 404 Page Layout */}
      {section.sectionKey === "not_found" && (
        <div className="rounded-3xl p-12 text-center bg-slate-50 border border-slate-200 space-y-4 max-w-xl mx-auto my-12">
          <p className="text-6xl font-black text-rose-700" style={{ color: brand.theme.accent }}>404</p>
          <h2 className="text-2xl font-bold text-slate-900">{section.title || "Page Not Found"}</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {section.subtitle || "The page you are looking for does not exist or has been relocated."}
          </p>
          {Boolean(c.ctaHref) && (
            <a
              href={String(c.ctaHref)}
              className="inline-block rounded-xl px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
              style={{ background: brand.theme.accent }}
            >
              {String(c.ctaText ?? "Go Back Home")}
            </a>
          )}
        </div>
      )}

      {/* 13. Maintenance Page Layout */}
      {section.sectionKey === "maintenance" && (
        <div className="rounded-3xl p-12 text-center bg-slate-900 text-white space-y-6 max-w-xl mx-auto my-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 to-rose-950/40 pointer-events-none" />
          <div className="relative z-1 space-y-4">
            <span className="rounded-full bg-amber-500/20 text-amber-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wider inline-block">
              ⚠️ System Maintenance
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{section.title || "Scheduled Maintenance"}</h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              {section.subtitle || "We are performing system upgrades and optimizations. We will be back online shortly."}
            </p>
            {Boolean(c.estimatedTime) && (
              <p className="text-[11px] font-bold text-rose-300">
                Estimated Restoral: {String(c.estimatedTime)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
