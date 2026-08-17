/**
 * Brand registry & Multilingual Language definitions.
 *
 * Supported Languages:
 *  - en: English
 *  - ta: Tamil (தமிழ்)
 *  - ml: Malayalam (മലയാളം)
 *  - ja: Japanese (日本語)
 *
 * Future Scalable Languages:
 *  - hi: Hindi (हिन्दी)
 *  - de: German (Deutsch)
 *  - fr: French (Français)
 *  - ko: Korean (한국어)
 */

export type BrandKey = "ascend" | "nihongo";

export interface SupportedLocale {
  code: string;
  name: string;
  nativeName: string;
  dir?: "ltr" | "rtl";
  status: "active" | "future";
}

export const PLATFORM_LOCALES: SupportedLocale[] = [
  { code: "en", name: "English", nativeName: "English", status: "active" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", status: "active" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", status: "active" },
  { code: "ja", name: "Japanese", nativeName: "日本語", status: "active" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", status: "future" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", status: "future" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", status: "future" },
  { code: "de", name: "German", nativeName: "Deutsch", status: "future" },
  { code: "fr", name: "French", nativeName: "Français", status: "future" },
  { code: "ko", name: "Korean", nativeName: "한국어", status: "future" },
];

export interface BrandConfig {
  key: BrandKey;
  slug: string;
  name: string;
  tagline: string;
  defaultLocale: string;
  supportedLocales: string[];
  theme: {
    primary: string;
    accent: string;
    surface: string;
    text: string;
  };
}

export const BRANDS: Record<BrandKey, BrandConfig> = {
  ascend: {
    key: "ascend",
    slug: "ascend",
    name: "Ascend Academy",
    tagline: "Rise through mastery.",
    defaultLocale: "en",
    supportedLocales: ["en", "ta", "ml", "ja", "hi", "de", "fr", "ko"],
    theme: {
      primary: "#0f172a",
      accent: "#f59e0b",
      surface: "#ffffff",
      text: "#0f172a",
    },
  },
  nihongo: {
    key: "nihongo",
    slug: "nihongo",
    name: "Nihongo Bridge",
    tagline: "Your bridge to fluent Japanese.",
    defaultLocale: "en",
    supportedLocales: ["en", "ta", "ml", "ja", "hi", "de", "fr", "ko"],
    theme: {
      primary: "#7c2d12",
      accent: "#e11d48",
      surface: "#fff7ed",
      text: "#1f2937",
    },
  },
};

export function getBrand(key: string): BrandConfig | null {
  return (BRANDS as Record<string, BrandConfig>)[key] ?? null;
}

export function listBrands(): BrandConfig[] {
  return Object.values(BRANDS);
}

export function getLocale(code: string): SupportedLocale {
  return (
    PLATFORM_LOCALES.find((l) => l.code === code) ?? {
      code: "en",
      name: "English",
      nativeName: "English",
      status: "active",
    }
  );
}
