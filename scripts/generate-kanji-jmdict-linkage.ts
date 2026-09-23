/**
 * Script to generate reports/gates/PHASE-14.4B-KANJI-JMDICT-LINKAGE-MANIFEST.json
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";
import {
  prepareKanjiJmdictLinkage,
  type CandidateDictionaryEntry,
  type KanjiJmdictLinkage,
} from "../src/services/knowledge/kanjiJmdictLinkage";

const TARGET_KANJI_LIST = [
  { char: "日", on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"] },
  { char: "月", on: ["ゲツ", "ガツ"], kun: ["つき"] },
  { char: "水", on: ["スイ"], kun: ["みず"] },
  { char: "火", on: ["カ"], kun: ["ひ", "-び", "ほ-"] },
  { char: "木", on: ["ボク", "モク"], kun: ["き", "こ-"] },
  { char: "金", on: ["キン", "コン"], kun: ["かね", "かな-"] },
  { char: "土", on: ["ド", "ト"], kun: ["つち"] },
  { char: "学", on: ["ガク"], kun: ["まな.ぶ"] },
  { char: "校", on: ["コウ"], kun: [] },
  { char: "道", on: ["ドウ", "トウ"], kun: ["みち"] },
  { char: "明", on: ["メイ", "ミョウ"], kun: ["あ.かり", "あか.るい", "あき.らか"] },
  { char: "休", on: ["キュウ"], kun: ["やす.む", "やす.まる", "やす.める"] },
  { char: "食", on: ["ショク", "ジキ"], kun: ["く.う", "く.らう", "た.べる"] },
  { char: "語", on: ["ゴ"], kun: ["かた.る", "かた.らう"] },
  { char: "心", on: ["シン"], kun: ["こころ"] },
  { char: "山", on: ["サン", "セン"], kun: ["やま"] },
  { char: "川", on: ["セン"], kun: ["かわ"] },
  { char: "花", on: ["カ", "ケ"], kun: ["はな"] },
  { char: "新", on: ["シン"], kun: ["あたら.しい", "あら.た", "にい-"] },
  { char: "古", on: ["コ"], kun: ["ふる.い", "ふる-", "-ふる.す"] },
];

async function main() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  });
  await client.connect();

  const allLinkages: KanjiJmdictLinkage[] = [];
  let onCompoundTotal = 0;
  let kunCompoundTotal = 0;
  let onSoloTotal = 0;
  let kunSoloTotal = 0;
  let specialTotal = 0;

  for (const item of TARGET_KANJI_LIST) {
    const res = await client.query(
      `SELECT id, reading, senses, kanji_characters 
       FROM dictionary_entries 
       WHERE kanji_characters @> $1 
       LIMIT 15`,
      [JSON.stringify([item.char])]
    );

    const candidates: CandidateDictionaryEntry[] = res.rows.map((row) => ({
      id: row.id,
      kanjiCharacters: row.kanji_characters || [],
      reading: row.reading,
      senses: row.senses || [],
    }));

    const linkages = prepareKanjiJmdictLinkage(
      item.char,
      item.on,
      item.kun,
      candidates
    );

    for (const link of linkages) {
      if (link.compoundType === "ON_COMPOUND") onCompoundTotal++;
      else if (link.compoundType === "KUN_COMPOUND") kunCompoundTotal++;
      else if (link.compoundType === "ON_SOLO") onSoloTotal++;
      else if (link.compoundType === "KUN_SOLO") kunSoloTotal++;
      else specialTotal++;
    }

    allLinkages.push(...linkages);
  }

  await client.end();

  const manifest = {
    source: "upstream:kanjidic2:2023-08",
    targetLexicon: "upstream:jmdict:2023-08",
    generatedAt: new Date().toISOString(),
    status: "dry_run_prepared",
    metrics: {
      sampledKanjiCount: TARGET_KANJI_LIST.length,
      totalLinkedCompounds: allLinkages.length,
      onCompoundCount: onCompoundTotal,
      kunCompoundCount: kunCompoundTotal,
      onSoloCount: onSoloTotal,
      kunSoloCount: kunSoloTotal,
      specialCount: specialTotal,
    },
    sampleLinkages: allLinkages.slice(0, 50),
  };

  const outputPath = resolve(
    process.cwd(),
    "reports/gates/PHASE-14.4B-KANJI-JMDICT-LINKAGE-MANIFEST.json"
  );
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(
    `Successfully generated linkage manifest with ${allLinkages.length} compound links at ${outputPath}`
  );
}

main().catch((err) => {
  console.error("Linkage manifest generation failed:", err);
  process.exit(1);
});
