import { db } from "@/db";
import {
  dictionaryEntries as dictionaryTable,
  grammarPatterns as grammarTable,
} from "@/db/schema";

export interface KnownVocab {
  id: string;
  headword: string;
  reading: string;
}

export interface KnownGrammar {
  id: string;
  title: string;
  patterns: string[];
}

export class SentenceMatcher {
  private static cachedVocab: KnownVocab[] | null = null;
  private static cachedGrammar: KnownGrammar[] | null = null;

  /**
   * Loads vocabulary and grammar patterns from database for linking.
   */
  static async load(dbClient = db): Promise<void> {
    const vocabRows = await dbClient
      .select({
        id: dictionaryTable.id,
        headword: dictionaryTable.headword,
        reading: dictionaryTable.reading,
      })
      .from(dictionaryTable);

    this.cachedVocab = vocabRows;

    const grammarRows = await dbClient
      .select({
        id: grammarTable.id,
        title: grammarTable.title,
      })
      .from(grammarTable);

    // Map each grammar pattern to substring trigger markers
    this.cachedGrammar = grammarRows.map((g) => {
      const patterns: string[] = [];
      if (g.id === "gp-wa") patterns.push("は");
      else if (g.id === "gp-ga") patterns.push("が");
      else if (g.id === "gp-wo") patterns.push("を");
      else if (g.id === "gp-te-kara") patterns.push("てから", "でから");
      else if (g.id === "gp-te-iru") patterns.push("ている", "ています", "ていた", "ていました");
      else if (g.id === "gp-tai") patterns.push("たい", "たくない", "たかった");
      else if (g.id === "gp-naide-kudasai") patterns.push("ないでください");
      else if (g.id === "gp-koto-ga-dekiru") patterns.push("ことができる", "ができます");
      else if (g.id === "gp-nakereba-naranai") patterns.push("なければならない", "なければなりません");
      else if (g.id === "gp-ta-koto-ga-aru") patterns.push("たことがある", "たことがあります");
      else if (g.id === "gp-hou-ga") patterns.push("のほうが", "より");
      else if (g.id === "gp-nagara") patterns.push("ながら");

      return {
        id: g.id,
        title: g.title,
        patterns,
      };
    });
  }

  /**
   * Matches dictionary entries found in a Japanese sentence text.
   */
  static matchDictionaryEntries(japanese: string): string[] {
    if (!this.cachedVocab) return [];
    const matched = new Set<string>();

    for (const v of this.cachedVocab) {
      // Prioritize headwords with 2+ characters or kanji to avoid single kana false positives
      if (v.headword.length >= 2 || /[\u4E00-\u9FFF]/.test(v.headword)) {
        if (japanese.includes(v.headword)) {
          matched.add(v.id);
        }
      }
    }

    return [...matched];
  }

  /**
   * Identifies primary grammar pattern matched in the sentence.
   */
  static matchGrammarPattern(japanese: string): string | null {
    if (!this.cachedGrammar) return null;

    // Check specific complex patterns first (longest match)
    const specificPatterns = this.cachedGrammar.filter(
      (g) => !["gp-wa", "gp-ga", "gp-wo"].includes(g.id),
    );

    for (const g of specificPatterns) {
      for (const p of g.patterns) {
        if (japanese.includes(p)) {
          return g.id;
        }
      }
    }

    // Fall back to particle markers if present
    const particles = this.cachedGrammar.filter((g) =>
      ["gp-wa", "gp-ga", "gp-wo"].includes(g.id),
    );
    for (const g of particles) {
      for (const p of g.patterns) {
        if (japanese.includes(p)) {
          return g.id;
        }
      }
    }

    return null;
  }
}
