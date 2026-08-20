import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  kgBookmarks,
  kgCollocations,
  kgConjugations,
  kgForms,
  kgGlosses,
  kgGrammar,
  kgKanji,
  kgLexemeGrammar,
  kgLexemes,
  kgLinks,
  kgOfflinePacks,
  kgSenses,
  kgSentences,
  systemSettings,
} from "@/db/schema";
import { uid } from "@/lib/utils";
import { conjugate } from "./conjugate";

const GLOSS_I18N: Record<string, { ja: string; hi: string; ta: string; ml: string }> = {
  食べる: { ja: "食物を口に入れる", hi: "खाना", ta: "சாப்பிடு", ml: "ഭക്ഷിക്കുക" },
  飲む: { ja: "液体を口に入れる", hi: "पीना", ta: "குடி", ml: "കുടിക്കുക" },
  水: { ja: "液体の水", hi: "पानी", ta: "தண்ணீர்", ml: "വെള്ളം" },
  本: { ja: "書籍", hi: "किताब", ta: "புத்தகம்", ml: "പുസ്തകം" },
  日本: { ja: "日本国", hi: "जापान", ta: "ஜப்பான்", ml: "ജപ്പാൻ" },
  行く: { ja: "移動する", hi: "जाना", ta: "போ", ml: "പോകുക" },
  見る: { ja: "目で捉える", hi: "देखना", ta: "பார்", ml: "കാണുക" },
  猫: { ja: "ネコ科の動物", hi: "बिल्ली", ta: "பூனை", ml: "പൂച്ച" },
  ありがとう: { ja: "感謝の言葉", hi: "धन्यवाद", ta: "நன்றி", ml: "നന്ദി" },
};

const LINKS: Array<[string, string, string]> = [
  ["大きい", "小さい", "antonym"],
  ["新しい", "古い", "antonym"],
  ["高い", "安い", "antonym"],
  ["食べる", "飲む", "related"],
  ["行く", "来る", "antonym"],
  ["先生", "学生", "related"],
  ["学校", "学生", "related"],
  ["駅", "電車", "related"],
  ["日本", "人", "related"],
  ["見る", "本", "related"],
];

const KEIGO: Array<[string, string, string, string]> = [
  ["食べる", "keigo", "召し上がる", "めしあがる"],
  ["食べる", "humble", "いただく", "いただく"],
  ["食べる", "casual", "食う", "くう"],
  ["行く", "keigo", "いらっしゃる", "いらっしゃる"],
  ["行く", "humble", "参る", "まいる"],
  ["見る", "keigo", "ご覧になる", "ごらんになる"],
  ["する", "keigo", "なさる", "なさる"],
  ["来る", "keigo", "いらっしゃる", "いらっしゃる"],
];

async function idForLemma(lemma: string) {
  const [row] = await db.select({ id: kgLexemes.id }).from(kgLexemes).where(eq(kgLexemes.lemma, lemma));
  return row?.id ?? null;
}

export async function enrichDictionary() {
  const lexemes = await db.select().from(kgLexemes);
  let glosses = 0;
  let cons = 0;
  for (const lex of lexemes) {
    const extra = GLOSS_I18N[lex.lemma];
    if (extra) {
      const [sense] = await db.select().from(kgSenses).where(eq(kgSenses.lexemeId, lex.id));
      if (sense) {
        for (const [lang, text] of Object.entries(extra)) {
          await db.insert(kgGlosses).values({ id: `gls-${lang}-${lex.externalId}`, senseId: sense.id, lang, text }).onConflictDoNothing();
          glosses += 1;
        }
      }
    }
    const forms = conjugate(lex.lemma, lex.reading, lex.pos);
    for (const form of forms) {
      await db
        .insert(kgConjugations)
        .values({ id: `cj-${lex.externalId}-${form.form}`, lexemeId: lex.id, ...form })
        .onConflictDoNothing();
      cons += 1;
    }
  }

  for (const [from, to, kind] of LINKS) {
    const fromId = await idForLemma(from);
    const toId = await idForLemma(to);
    if (fromId && toId) {
      await db.insert(kgLinks).values({ id: `lnk-${kind}-${from}-${to}`, fromId, toId, kind }).onConflictDoNothing();
      await db.insert(kgLinks).values({ id: `lnk-${kind}-${to}-${from}`, fromId: toId, toId: fromId, kind }).onConflictDoNothing();
    }
  }

  const nihon = await idForLemma("日本");
  if (nihon) {
    await db.insert(kgLinks).values({ id: "lnk-variant-nihon", fromId: nihon, toId: nihon, kind: "variant" }).onConflictDoNothing();
    await db.insert(kgForms).values({ id: "frm-nihon-nippon", lexemeId: nihon, style: "variant", surface: "日本", reading: "にっぽん" }).onConflictDoNothing();
  }

  for (const [lemma, style, surface, reading] of KEIGO) {
    const lexemeId = await idForLemma(lemma);
    if (!lexemeId) continue;
    await db.insert(kgForms).values({ id: `frm-${lemma}-${style}`, lexemeId, style, surface, reading }).onConflictDoNothing();
  }

  const eat = await idForLemma("食べる");
  const go = await idForLemma("行く");
  if (eat) await db.insert(kgLexemeGrammar).values({ lexemeId: eat, grammarId: "gr-masu" }).onConflictDoNothing();
  if (go) await db.insert(kgLexemeGrammar).values({ lexemeId: go, grammarId: "gr-ni" }).onConflictDoNothing();

  const pack = JSON.stringify({ lexemes: lexemes.slice(0, 40).map((row) => ({ id: row.id, lemma: row.lemma, reading: row.reading, pos: row.pos, jlpt: row.jlpt })) });
  await db
    .insert(kgOfflinePacks)
    .values({ id: "pack-n5", name: "N5 offline pack", version: 1, bytes: pack.length, checksum: String(pack.length) })
    .onConflictDoNothing();

  await db
    .insert(kgKanji)
    .values({
      id: "kj-鷹",
      character: "鷹",
      strokes: 24,
      jlpt: "N1",
      freq: 1676,
      radical: "鳥",
      heisig: "hawk",
      searchDocument: "鷹 タカ hawk falcon rare",
      checksum: "rare-hawk",
    })
    .onConflictDoNothing();
  await db
    .insert(kgKanji)
    .values({
      id: "kj-鬱",
      character: "鬱",
      strokes: 29,
      jlpt: "N1",
      freq: 2105,
      radical: "鬯",
      heisig: "gloom",
      searchDocument: "鬱 ウツ gloom depression rare",
      checksum: "rare-gloom",
    })
    .onConflictDoNothing();

  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase6_dict"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase6_dict", value: "1" });
  }
  return { glosses, conjugations: cons, lexemes: lexemes.length };
}

export async function dictionaryCard(id: string) {
  const { lexemeDetail } = await import("@/lib/kg/search");
  const base = await lexemeDetail(id);
  if (!base) return null;
  const [links, forms, conjugations, grammarLinks, examples, collocations] = await Promise.all([
    db.select().from(kgLinks).where(eq(kgLinks.fromId, id)),
    db.select().from(kgForms).where(eq(kgForms.lexemeId, id)),
    db.select().from(kgConjugations).where(eq(kgConjugations.lexemeId, id)),
    db.select().from(kgLexemeGrammar).where(eq(kgLexemeGrammar.lexemeId, id)),
    db.select().from(kgSentences).limit(40),
    db.select().from(kgCollocations).limit(40),
  ]);
  const grammar = [];
  for (const link of grammarLinks) {
    const [row] = await db.select().from(kgGrammar).where(eq(kgGrammar.id, link.grammarId));
    if (row) grammar.push(row);
  }
  const relatedIds = links.map((link) => link.toId);
  const related = [];
  for (const relatedId of relatedIds.slice(0, 12)) {
    const [row] = await db.select().from(kgLexemes).where(eq(kgLexemes.id, relatedId));
    if (row) {
      const kind = links.find((link) => link.toId === relatedId)?.kind ?? "related";
      related.push({ ...row, kind });
    }
  }
  const lemma = base.lexeme.lemma;
  return {
    ...base,
    forms,
    conjugations,
    grammar,
    related,
    examples: examples.filter((row) => row.ja.includes(lemma) || row.en.toLowerCase().includes(base.glosses[0]?.text.toLowerCase() ?? "___")),
    collocations: collocations.filter((row) => row.leftJa.includes(lemma) || row.rightJa.includes(lemma) || lemma.includes(row.leftJa)),
  };
}

export async function toggleBookmark(learnerId: string, targetType: string, targetId: string) {
  const existing = await db
    .select()
    .from(kgBookmarks)
    .where(eq(kgBookmarks.learnerId, learnerId));
  const hit = existing.find((row) => row.targetType === targetType && row.targetId === targetId);
  if (hit) {
    await db.delete(kgBookmarks).where(eq(kgBookmarks.id, hit.id));
    return { bookmarked: false };
  }
  await db.insert(kgBookmarks).values({ id: uid("bmk"), learnerId, targetType, targetId });
  return { bookmarked: true };
}

export async function listBookmarks(learnerId: string) {
  return db.select().from(kgBookmarks).where(eq(kgBookmarks.learnerId, learnerId));
}

export async function offlinePack() {
  const lexemes = await db.select().from(kgLexemes);
  const kanji = await db.select().from(kgKanji);
  const conjugations = await db.select().from(kgConjugations);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    lexemes: lexemes.map((row) => ({
      id: row.id,
      lemma: row.lemma,
      reading: row.reading,
      pos: row.pos,
      jlpt: row.jlpt,
    })),
    kanji: kanji.map((row) => ({
      character: row.character,
      strokes: row.strokes,
      jlpt: row.jlpt,
      freq: row.freq,
      rare: (row.freq ?? 9999) > 300 || row.strokes >= 12,
    })),
    conjugations,
  };
}
