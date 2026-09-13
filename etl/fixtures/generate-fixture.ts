/**
 * Deterministic JMdict fixture generator.
 *
 * Produces a structurally faithful JMdict_e subset (DOCTYPE entities, k_ele /
 * r_ele / sense, priority codes) including a small number of deliberately
 * malformed and duplicated entries so the validate + deduplicate stages are
 * genuinely exercised rather than trivially passing.
 *
 * Usage: npx tsx etl/fixtures/generate-fixture.ts [count] [outPath]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SEED_WORDS: {
  keb: string;
  reb: string;
  pos: string;
  glosses: string[];
  pri?: string[];
}[] = [
  { keb: "水", reb: "みず", pos: "n", glosses: ["water", "cold water"], pri: ["ichi1", "news1", "nf05"] },
  { keb: "食べる", reb: "たべる", pos: "v1", glosses: ["to eat"], pri: ["ichi1"] },
  { keb: "飲む", reb: "のむ", pos: "v5m", glosses: ["to drink", "to swallow"], pri: ["ichi1", "nf10"] },
  { keb: "行く", reb: "いく", pos: "v5k-s", glosses: ["to go", "to move"], pri: ["ichi1"] },
  { keb: "見る", reb: "みる", pos: "v1", glosses: ["to see", "to look", "to watch"], pri: ["ichi1"] },
  { keb: "本", reb: "ほん", pos: "n", glosses: ["book", "volume"], pri: ["ichi1", "nf02"] },
  { keb: "犬", reb: "いぬ", pos: "n", glosses: ["dog"], pri: ["ichi1", "nf15"] },
  { keb: "猫", reb: "ねこ", pos: "n", glosses: ["cat"], pri: ["ichi1", "nf20"] },
  { keb: "学校", reb: "がっこう", pos: "n", glosses: ["school"], pri: ["ichi1", "nf04"] },
  { keb: "友達", reb: "ともだち", pos: "n", glosses: ["friend", "companion"], pri: ["ichi1"] },
  { keb: "先生", reb: "せんせい", pos: "n", glosses: ["teacher", "master", "doctor"], pri: ["ichi1", "nf07"] },
  { keb: "大きい", reb: "おおきい", pos: "adj-i", glosses: ["big", "large", "great"], pri: ["ichi1"] },
  { keb: "小さい", reb: "ちいさい", pos: "adj-i", glosses: ["small", "little", "tiny"], pri: ["ichi1"] },
  { keb: "新しい", reb: "あたらしい", pos: "adj-i", glosses: ["new", "fresh"], pri: ["ichi1"] },
  { keb: "今日", reb: "きょう", pos: "n-t", glosses: ["today", "this day"], pri: ["ichi1", "nf01"] },
  { keb: "時間", reb: "じかん", pos: "n", glosses: ["time", "hour"], pri: ["ichi1", "nf03"] },
  { keb: "明白", reb: "めいはく", pos: "adj-na", glosses: ["obvious", "clear", "plain"], pri: ["ichi1"] },
  { keb: "電車", reb: "でんしゃ", pos: "n", glosses: ["train", "electric train"], pri: ["ichi1", "nf12"] },
  { keb: "会社", reb: "かいしゃ", pos: "n", glosses: ["company", "corporation"], pri: ["ichi1", "nf01"] },
  { keb: "勉強", reb: "べんきょう", pos: "n,vs", glosses: ["study", "diligence"], pri: ["ichi1", "nf08"] },
];

const FIELDS = ["", "comp", "med", "ling", "food"];
const MISC = ["", "uk", "col", "obs", "hon"];

function entryXml(
  seq: number,
  word: { keb: string; reb: string; pos: string; glosses: string[]; pri?: string[] },
  variant: number,
): string {
  const pri = word.pri ?? [];
  const kePri = pri.map((p) => `    <ke_pri>${p}</ke_pri>`).join("\n");
  const rePri = pri.map((p) => `    <re_pri>${p}</re_pri>`).join("\n");
  const posTags = word.pos
    .split(",")
    .map((p) => `    <pos>&${p};</pos>`)
    .join("\n");
  const glosses = word.glosses.map((g) => `    <gloss>${g}</gloss>`).join("\n");

  const field = FIELDS[variant % FIELDS.length];
  const misc = MISC[variant % MISC.length];
  const fieldTag = field ? `\n    <field>&${field};</field>` : "";
  const miscTag = misc ? `\n    <misc>&${misc};</misc>` : "";

  return `<entry>
  <ent_seq>${seq}</ent_seq>
  <k_ele>
    <keb>${word.keb}</keb>
${kePri}
  </k_ele>
  <r_ele>
    <reb>${word.reb}</reb>
${rePri}
  </r_ele>
  <sense>
${posTags}${fieldTag}${miscTag}
${glosses}
  </sense>
</entry>`;
}

/** Entry with no gloss — must be rejected by the validator. */
function invalidNoGlossXml(seq: number): string {
  return `<entry>
  <ent_seq>${seq}</ent_seq>
  <k_ele><keb>無効</keb></k_ele>
  <r_ele><reb>むこう</reb></r_ele>
  <sense><pos>&n;</pos></sense>
</entry>`;
}

/** Entry with no reading — must be rejected by the validator. */
function invalidNoReadingXml(seq: number): string {
  return `<entry>
  <ent_seq>${seq}</ent_seq>
  <k_ele><keb>欠落</keb></k_ele>
  <sense><pos>&n;</pos><gloss>missing reading</gloss></sense>
</entry>`;
}

/** Kana-only entry (no k_ele) — must be ACCEPTED, reading becomes headword. */
function kanaOnlyXml(seq: number): string {
  return `<entry>
  <ent_seq>${seq}</ent_seq>
  <r_ele><reb>ありがとう</reb><re_pri>ichi1</re_pri></r_ele>
  <sense><pos>&int;</pos><gloss>thank you</gloss><gloss>thanks</gloss></sense>
</entry>`;
}

export function buildFixture(count: number): string {
  const parts: string[] = [];
  let seq = 1000000;

  for (let i = 0; i < count; i++) {
    const word = SEED_WORDS[i % SEED_WORDS.length];
    const variant = Math.floor(i / SEED_WORDS.length);
    // Make repeats distinct so they are not false duplicates.
    const w =
      variant === 0
        ? word
        : { ...word, keb: `${word.keb}${variant}`, reb: `${word.reb}${variant}` };
    parts.push(entryXml(seq++, w, i));
  }

  // Deliberate edge cases
  parts.push(kanaOnlyXml(seq++));
  parts.push(invalidNoGlossXml(seq++));
  parts.push(invalidNoReadingXml(seq++));

  // Deliberate duplicates: repeat two existing ent_seq values verbatim.
  parts.push(entryXml(1000000, SEED_WORDS[0], 0));
  parts.push(entryXml(1000001, SEED_WORDS[1], 1));

  const entities = [
    "n", "v1", "v5m", "v5k-s", "adj-i", "adj-na", "n-t", "vs", "int",
    "comp", "med", "ling", "food", "uk", "col", "obs", "hon",
  ]
    .map((e) => `<!ENTITY ${e} "${e}">`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE JMdict [
${entities}
]>
<!-- JMdict TEST FIXTURE — synthetic, structurally faithful subset.
     Not redistributed upstream data. Generated by etl/fixtures/generate-fixture.ts -->
<JMdict>
${parts.join("\n")}
</JMdict>
`;
}

async function main() {
  const count = Number.parseInt(process.argv[2] ?? "500", 10);
  const out = process.argv[3] ?? "etl/fixtures/jmdict-sample.xml";
  const xml = buildFixture(count);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, xml, "utf8");
  // 5 extra: kana-only, 2 invalid, 2 duplicates
  console.log(`Wrote ${out} (${count} base entries + 5 edge cases, ${xml.length} bytes)`);
}

if (process.argv[1]?.includes("generate-fixture")) {
  void main();
}
