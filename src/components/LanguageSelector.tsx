"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { type SupportedLanguage, SUPPORTED_LANGUAGES } from "@/types/translation";

interface LanguageContextType {
  targetLanguage: SupportedLanguage;
  setTargetLanguage: (lang: SupportedLanguage) => void;
  languageNames: Record<SupportedLanguage, { label: string; native: string }>;
}

const LANGUAGE_METADATA: Record<SupportedLanguage, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  ta: { label: "Tamil", native: "தமிழ்" },
  ml: { label: "Malayalam", native: "മലയാളം" },
};

const LanguageContext = createContext<LanguageContextType>({
  targetLanguage: "en",
  setTargetLanguage: () => {},
  languageNames: LANGUAGE_METADATA,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [targetLanguage, setTargetLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("nihongobridge_target_language") as SupportedLanguage;
        if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
          return saved;
        }
      } catch {
        // LocalStorage unavailable
      }
    }
    return "en";
  });

  const setTargetLanguage = (lang: SupportedLanguage) => {
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      setTargetLanguageState(lang);
      try {
        localStorage.setItem("nihongobridge_target_language", lang);
      } catch {
        // Ignore
      }
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        targetLanguage,
        setTargetLanguage,
        languageNames: LANGUAGE_METADATA,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { targetLanguage, setTargetLanguage, languageNames } = useLanguage();

  return (
    <div
      data-testid="language-selector"
      className={`inline-flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg p-1 text-xs text-slate-300 ${className}`}
    >
      <span className="text-slate-400 font-medium px-1.5 flex items-center gap-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400">JP</span>
        <span className="text-slate-500">→</span>
      </span>
      {SUPPORTED_LANGUAGES.map((lang) => {
        const meta = languageNames[lang];
        const isActive = targetLanguage === lang;
        return (
          <button
            key={lang}
            data-testid={`lang-btn-${lang}`}
            onClick={() => setTargetLanguage(lang)}
            className={`px-2.5 py-1 rounded transition-all font-medium ${
              isActive
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
            }`}
            title={`Translate Japanese to ${meta.label} (${meta.native})`}
          >
            {meta.native}
          </button>
        );
      })}
    </div>
  );
}
