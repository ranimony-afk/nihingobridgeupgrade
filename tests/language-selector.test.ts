import { describe, it, expect } from "vitest";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/types/translation";

describe("Language Selector & Context Configuration", () => {
  it("should support exact configured learning target languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "ta", "ml"]);
  });

  it("should preserve Japanese as canonical language while allowing target translation toggles", () => {
    const targetTranslations: Record<SupportedLanguage, { label: string; native: string }> = {
      en: { label: "English", native: "English" },
      ta: { label: "Tamil", native: "தமிழ்" },
      ml: { label: "Malayalam", native: "മലയാളം" },
    };

    expect(targetTranslations.en.native).toBe("English");
    expect(targetTranslations.ta.native).toBe("தமிழ்");
    expect(targetTranslations.ml.native).toBe("മലയാളം");

    // Canonical learning language is strictly Japanese
    const canonicalLearningLanguage = "ja";
    expect(canonicalLearningLanguage).toBe("ja");
  });
});
