/**
 * Deterministic Tatoeba fixture generator.
 *
 * Emits two TSV files mirroring the real exports:
 *   sentences_detailed.csv -> id \t lang \t text \t username \t added \t modified
 *   links.csv              -> sentence_id \t translation_id
 *
 * Seeded with deliberate edge cases (orphaned owner, wrong script, control
 * characters, over-long text, non-Japanese rows, duplicates, dangling links)
 * so validation, language filtering and link filtering are genuinely tested.
 *
 * Usage: npx tsx etl/fixtures/generate-tatoeba-fixture.ts [count]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type Pair = { jp: string; en: string; user: string };

const SEEDS: Pair[] = [
  { jp: "水を飲みます。", en: "I drink water.", user: "tanaka" },
  { jp: "りんごを食べる。", en: "I eat an apple.", user: "ck" },
  { jp: "学校へ行く。", en: "I go to school.", user: "mookeee" },
  { jp: "映画を見る。", en: "I watch a movie.", user: "bunbuku" },
  { jp: "本を読みます。", en: "I read a book.", user: "tanaka" },
  { jp: "犬がいます。", en: "There is a dog.", user: "ck" },
  { jp: "猫が好きです。", en: "I like cats.", user: "arnab" },
  { jp: "今日は暑いです。", en: "It is hot today.", user: "mookeee" },
  { jp: "friendと話す。", en: "I talk with a friend.", user: "bunbuku" },
  { jp: "先生は優しいです。", en: "The teacher is kind.", user: "tanaka" },
  { jp: "電車に乗ります。", en: "I ride the train.", user: "ck" },
  { jp: "日本語を勉強しています。", en: "I am studying Japanese.", user: "arnab" },
  { jp: "時間がありません。", en: "I have no time.", user: "mookeee" },
  { jp: "新しい車を買いました。", en: "I bought a new car.", user: "bunbuku" },
  { jp: "山が見えます。", en: "I can see the mountain.", user: "tanaka" },
];

function tsvSafe(value: string): string {
  // Tabs/newlines are structural in TSV, so they can never appear in a field.
  return value.replace(/[\t\r\n]/g, " ");
}

export type Fixture = { sentences: string; links: string };

export function buildTatoebaFixture(count: number): Fixture {
  const sRows: string[] = [];
  const lRows: string[] = [];

  let id = 200000;
  const added = "2023-01-01 12:00:00";
  const modified = "2023-06-01 12:00:00";

  const jpIds: number[] = [];
  const enIds: number[] = [];

  for (let i = 0; i < count; i++) {
    const seed = SEEDS[i % SEEDS.length];
    const variant = Math.floor(i / SEEDS.length);
    const jpText = variant === 0 ? seed.jp : `${seed.jp.slice(0, -1)}${variant}。`;
    const enText = variant === 0 ? seed.en : `${seed.en.slice(0, -1)} ${variant}.`;

    const jpId = id++;
    const enId = id++;
    jpIds.push(jpId);
    enIds.push(enId);

    sRows.push(`${jpId}\tjpn\t${tsvSafe(jpText)}\t${seed.user}\t${added}\t${modified}`);
    // English rows exist so language filtering has something to filter.
    sRows.push(`${enId}\teng\t${tsvSafe(enText)}\t${seed.user}\t${added}\t${modified}`);

    // Bidirectional link, exactly as Tatoeba exports it.
    lRows.push(`${jpId}\t${enId}`);
    lRows.push(`${enId}\t${jpId}`);
  }

  // ---- deliberate edge cases -------------------------------------------
  // 1. Orphaned owner (\N) -> must be ACCEPTED, attributed to "Tatoeba".
  const orphanId = id++;
  sRows.push(`${orphanId}\tjpn\t名前のない文です。\t\\N\t${added}\t${modified}`);
  jpIds.push(orphanId);

  // 2. jpn-tagged but no Japanese script -> REJECTED.
  sRows.push(`${id++}\tjpn\tThis is not Japanese at all\tck\t${added}\t${modified}`);

  // 3. Control character in text -> REJECTED.
  sRows.push(`${id++}\tjpn\t壊れた\u0007文字です。\tck\t${added}\t${modified}`);

  // 4. Over-length text -> REJECTED.
  sRows.push(`${id++}\tjpn\t${"あ".repeat(400)}\tck\t${added}\t${modified}`);

  // 5. Invalid language code -> REJECTED.
  sRows.push(`${id++}\tjapanese\t日本語です。\tck\t${added}\t${modified}`);

  // 6. Empty text -> REJECTED.
  sRows.push(`${id++}\tjpn\t\tck\t${added}\t${modified}`);

  // 7. Duplicate ids: repeat two Japanese rows verbatim.
  sRows.push(`${jpIds[0]}\tjpn\t${tsvSafe(SEEDS[0].jp)}\t${SEEDS[0].user}\t${added}\t${modified}`);
  sRows.push(`${jpIds[1]}\tjpn\t${tsvSafe(SEEDS[1].jp)}\t${SEEDS[1].user}\t${added}\t${modified}`);

  // 8. Dangling links: reference ids that are never ingested.
  lRows.push(`${jpIds[0]}\t999999001`);
  lRows.push(`999999002\t${jpIds[0]}`);
  // 9. Self-link -> dropped by the parser.
  lRows.push(`${jpIds[0]}\t${jpIds[0]}`);

  return { sentences: `${sRows.join("\n")}\n`, links: `${lRows.join("\n")}\n` };
}

async function main() {
  const count = Number.parseInt(process.argv[2] ?? "250", 10);
  const sentencesOut =
    process.argv[3] ?? "etl/fixtures/tatoeba-sentences-sample.tsv";
  const linksOut = process.argv[4] ?? "etl/fixtures/tatoeba-links-sample.tsv";

  const fixture = buildTatoebaFixture(count);
  await mkdir(dirname(sentencesOut), { recursive: true });
  await writeFile(sentencesOut, fixture.sentences, "utf8");
  await writeFile(linksOut, fixture.links, "utf8");

  const sLines = fixture.sentences.trimEnd().split("\n").length;
  const lLines = fixture.links.trimEnd().split("\n").length;
  console.log(`Wrote ${sentencesOut} (${sLines} rows)`);
  console.log(`Wrote ${linksOut} (${lLines} rows)`);
}

if (process.argv[1]?.includes("generate-tatoeba-fixture")) {
  void main();
}
