/**
 * Deterministic KANJIDIC2 fixture generator.
 *
 * Structurally faithful to kanjidic2.xml (header, codepoint, radical, misc,
 * dic_number, query_code, reading_meaning/rmgroup, nanori) and seeded with
 * deliberate edge cases so validate + deduplicate are genuinely exercised.
 *
 * Usage: npx tsx etl/fixtures/generate-kanji-fixture.ts [count] [outPath]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type Seed = {
  literal: string;
  strokes: number;
  grade: number;
  radical: number;
  freq: number;
  jlpt: number;
  on: string[];
  kun: string[];
  meanings: string[];
  nanori?: string[];
};

// Real kanji with accurate stroke counts, grades and radicals.
const SEEDS: Seed[] = [
  { literal: "日", strokes: 4, grade: 1, radical: 72, freq: 1, jlpt: 4, on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"], meanings: ["day", "sun", "Japan", "counter for days"], nanori: ["あ", "あき"] },
  { literal: "一", strokes: 1, grade: 1, radical: 1, freq: 2, jlpt: 4, on: ["イチ", "イツ"], kun: ["ひと-", "ひと.つ"], meanings: ["one", "one radical (no.1)"], nanori: ["かず"] },
  { literal: "人", strokes: 2, grade: 1, radical: 9, freq: 5, jlpt: 4, on: ["ジン", "ニン"], kun: ["ひと", "-り", "-と"], meanings: ["person"], nanori: ["ジrepresentative"] },
  { literal: "大", strokes: 3, grade: 1, radical: 37, freq: 7, jlpt: 4, on: ["ダイ", "タイ"], kun: ["おお-", "おお.きい"], meanings: ["large", "big"] },
  { literal: "本", strokes: 5, grade: 1, radical: 75, freq: 10, jlpt: 4, on: ["ホン"], kun: ["もと"], meanings: ["book", "present", "main", "origin", "true", "counter for long cylindrical things"] },
  { literal: "中", strokes: 4, grade: 1, radical: 2, freq: 11, jlpt: 4, on: ["チュウ"], kun: ["なか", "うち", "あた.る"], meanings: ["in", "inside", "middle", "mean", "center"] },
  { literal: "水", strokes: 4, grade: 1, radical: 85, freq: 300, jlpt: 4, on: ["スイ"], kun: ["みず", "みず-"], meanings: ["water"] },
  { literal: "火", strokes: 4, grade: 1, radical: 86, freq: 557, jlpt: 4, on: ["カ"], kun: ["ひ", "-び", "ほ-"], meanings: ["fire"] },
  { literal: "山", strokes: 3, grade: 1, radical: 46, freq: 149, jlpt: 4, on: ["サン", "セン"], kun: ["やま"], meanings: ["mountain"] },
  { literal: "川", strokes: 3, grade: 1, radical: 47, freq: 250, jlpt: 4, on: ["セン"], kun: ["かわ"], meanings: ["stream", "river", "river or three-stroke river radical (no. 47)"] },
  { literal: "学", strokes: 8, grade: 1, radical: 39, freq: 63, jlpt: 4, on: ["ガク"], kun: ["まな.ぶ"], meanings: ["study", "learning", "science"] },
  { literal: "校", strokes: 10, grade: 1, radical: 75, freq: 169, jlpt: 4, on: ["コウ"], kun: [], meanings: ["exam", "school", "printing", "proof", "correction"] },
  { literal: "語", strokes: 14, grade: 2, radical: 149, freq: 301, jlpt: 4, on: ["ゴ"], kun: ["かた.る", "かた.らう"], meanings: ["word", "speech", "language"] },
  { literal: "話", strokes: 13, grade: 2, radical: 149, freq: 202, jlpt: 4, on: ["ワ"], kun: ["はな.す", "はなし"], meanings: ["tale", "talk"] },
  { literal: "時", strokes: 10, grade: 2, radical: 72, freq: 16, jlpt: 4, on: ["ジ"], kun: ["とき", "-どき"], meanings: ["time", "hour"] },
  { literal: "間", strokes: 12, grade: 2, radical: 169, freq: 27, jlpt: 4, on: ["カン", "ケン"], kun: ["あいだ", "ま", "あい"], meanings: ["interval", "space"] },
  { literal: "食", strokes: 9, grade: 2, radical: 184, freq: 382, jlpt: 3, on: ["ショク", "ジキ"], kun: ["く.う", "た.べる"], meanings: ["eat", "food"] },
  { literal: "電", strokes: 13, grade: 2, radical: 173, freq: 178, jlpt: 3, on: ["デン"], kun: [], meanings: ["electricity"] },
  { literal: "車", strokes: 7, grade: 1, radical: 159, freq: 3, jlpt: 4, on: ["シャ"], kun: ["くるま"], meanings: ["car"] },
  { literal: "行", strokes: 6, grade: 2, radical: 144, freq: 20, jlpt: 4, on: ["コウ", "ギョウ", "アン"], kun: ["い.く", "ゆ.く", "おこな.う"], meanings: ["going", "journey", "carry out", "conduct", "act", "line", "row", "bank"] },
];

// Extra CJK codepoints used to mint additional distinct, valid characters.
const EXTRA_BASE = 0x4e00;

function characterXml(s: Seed, extraVariant: boolean): string {
  const cp = (s.literal.codePointAt(0) ?? 0).toString(16).padStart(4, "0");
  const onXml = s.on.map((r) => `<reading r_type="ja_on">${r}</reading>`).join("");
  const kunXml = s.kun.map((r) => `<reading r_type="ja_kun">${r}</reading>`).join("");
  const meaningXml = s.meanings.map((m) => `<meaning>${escapeXml(m)}</meaning>`).join("");
  // Non-English meanings must be captured with their m_lang.
  const frXml = `<meaning m_lang="fr">${escapeXml(s.meanings[0])}-fr</meaning>`;
  const nanoriXml = (s.nanori ?? []).map((n) => `<nanori>${n}</nanori>`).join("");
  const variantXml = extraVariant
    ? `<variant var_type="jis208">48-19</variant>`
    : "";
  // Second stroke_count = a KANJIDIC2 "miscount".
  const miscount = extraVariant ? `<stroke_count>${s.strokes + 1}</stroke_count>` : "";

  return `<character>
<literal>${s.literal}</literal>
<codepoint><cp_value cp_type="ucs">${cp}</cp_value><cp_value cp_type="jis208">16-01</cp_value></codepoint>
<radical><rad_value rad_type="classical">${s.radical}</rad_value><rad_value rad_type="nelson_c">${s.radical}</rad_value></radical>
<misc><grade>${s.grade}</grade><stroke_count>${s.strokes}</stroke_count>${miscount}${variantXml}<freq>${s.freq}</freq><jlpt>${s.jlpt}</jlpt></misc>
<dic_number><dic_ref dr_type="nelson_c">1</dic_ref><dic_ref dr_type="halpern_njecd">2</dic_ref></dic_number>
<query_code><q_code qc_type="skip">1-2-3</q_code></query_code>
<reading_meaning><rmgroup><reading r_type="pinyin">ri4</reading><reading r_type="korean_r">il</reading>${onXml}${kunXml}${meaningXml}${frXml}</rmgroup>${nanoriXml}</reading_meaning>
</character>`;
}

function escapeXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Synthetic but valid character from a codepoint offset. */
function syntheticXml(index: number): string {
  const cp = EXTRA_BASE + 0x200 + index;
  const literal = String.fromCodePoint(cp);
  const strokes = (index % 20) + 1;
  return `<character>
<literal>${literal}</literal>
<codepoint><cp_value cp_type="ucs">${cp.toString(16)}</cp_value></codepoint>
<radical><rad_value rad_type="classical">${(index % 214) + 1}</rad_value></radical>
<misc><grade>${(index % 6) + 1}</grade><stroke_count>${strokes}</stroke_count><freq>${1000 + index}</freq></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">オン${index}</reading><reading r_type="ja_kun">くん${index}</reading><meaning>synthetic meaning ${index}</meaning></rmgroup></reading_meaning>
</character>`;
}

/** No stroke_count -> must be REJECTED. */
function invalidNoStrokesXml(): string {
  return `<character>
<literal>鬱</literal>
<codepoint><cp_value cp_type="ucs">9b31</cp_value></codepoint>
<radical><rad_value rad_type="classical">192</rad_value></radical>
<misc><grade>8</grade></misc>
<reading_meaning><rmgroup><meaning>gloom</meaning></rmgroup></reading_meaning>
</character>`;
}

/** Literal is kana, not a CJK ideograph -> must be REJECTED. */
function invalidNonKanjiXml(): string {
  return `<character>
<literal>あ</literal>
<codepoint><cp_value cp_type="ucs">3042</cp_value></codepoint>
<radical><rad_value rad_type="classical">1</rad_value></radical>
<misc><stroke_count>3</stroke_count></misc>
<reading_meaning><rmgroup><meaning>not a kanji</meaning></rmgroup></reading_meaning>
</character>`;
}

/** Implausible stroke count -> must be REJECTED. */
function invalidStrokeCountXml(): string {
  return `<character>
<literal>森</literal>
<codepoint><cp_value cp_type="ucs">68ee</cp_value></codepoint>
<radical><rad_value rad_type="classical">75</rad_value></radical>
<misc><stroke_count>99</stroke_count></misc>
<reading_meaning><rmgroup><meaning>forest</meaning></rmgroup></reading_meaning>
</character>`;
}

/** Valid character carrying NO readings/meanings -> must be REJECTED. */
function invalidEmptyRmXml(): string {
  return `<character>
<literal>丼</literal>
<codepoint><cp_value cp_type="ucs">4e3c</cp_value></codepoint>
<radical><rad_value rad_type="classical">3</rad_value></radical>
<misc><stroke_count>5</stroke_count></misc>
</character>`;
}

export function buildKanjiFixture(count: number): string {
  const parts: string[] = [];

  for (let i = 0; i < count; i++) {
    if (i < SEEDS.length) {
      parts.push(characterXml(SEEDS[i], i % 3 === 0));
    } else {
      parts.push(syntheticXml(i));
    }
  }

  // Deliberate edge cases
  parts.push(invalidNoStrokesXml());
  parts.push(invalidNonKanjiXml());
  parts.push(invalidStrokeCountXml());
  parts.push(invalidEmptyRmXml());

  // Deliberate duplicates: repeat two literals already emitted.
  parts.push(characterXml(SEEDS[0], false));
  parts.push(characterXml(SEEDS[1], false));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kanjidic2 [
]>
<!-- KANJIDIC2 TEST FIXTURE — synthetic, structurally faithful subset.
     Not redistributed upstream data. Generated by etl/fixtures/generate-kanji-fixture.ts -->
<kanjidic2>
<header>
<file_version>4</file_version>
<database_version>2024-000</database_version>
<date_of_creation>2024-01-01</date_of_creation>
</header>
${parts.join("\n")}
</kanjidic2>
`;
}

async function main() {
  const count = Number.parseInt(process.argv[2] ?? "300", 10);
  const out = process.argv[3] ?? "etl/fixtures/kanjidic2-sample.xml";
  const xml = buildKanjiFixture(count);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, xml, "utf8");
  console.log(
    `Wrote ${out} (${count} base characters + 6 edge cases, ${xml.length} bytes)`,
  );
}

if (process.argv[1]?.includes("generate-kanji-fixture")) {
  void main();
}
