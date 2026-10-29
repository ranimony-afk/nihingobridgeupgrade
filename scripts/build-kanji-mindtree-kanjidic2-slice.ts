import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { KANJI } from "../src/data/kanji";
import {
  EXPECTED_KANJIDIC2_ARCHIVE_SHA256,
  EXPECTED_KANJIDIC2_BYTES,
  EXPECTED_KANJIDIC2_ENTRIES,
  EXPECTED_KANJIDIC2_RELEASE,
  EXPECTED_KANJIDIC2_SHA256,
  KANJIDIC2_ARCHIVE_BLOB_SHA,
  KANJIDIC2_ARCHIVE_COMMIT,
  KANJIDIC2_ARCHIVE_PATH,
  KANJIDIC2_ARCHIVE_REPOSITORY,
  KANJIDIC2_SOURCE_ID,
} from "../src/etl/kanji/kanjidic2Contract";
import { streamKanjidicCharacters } from "../src/etl/kanji/xmlParser";
import type { RawKanjidicCharacter } from "../src/etl/kanji/types";
import { scanAndVerifyKanjidic2Xml } from "./provision-kanjidic2-ci";

const MINDTREE_LICENSE = "CC-BY-SA-4.0";
const MINDTREE_ATTRIBUTION =
  "KANJIDIC2, compiled and maintained by the Electronic Dictionary Research and Development Group (EDRDG). https://www.edrdg.org/wiki/index.php/KANJIDIC2";
const LICENSE_NOTICE = "https://www.edrdg.org/edrdg/licence.html";
const KANJIVG_ARCHIVE_SHA256 = "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd";
const KANJIVG_ARCHIVE_ROOT = "kanjivg-r20240807/kanji/";
const TARGET_COUNT = 100;

interface Kanjidic2MindTreeFact {
  character: string;
  meaningsEnglish: string[];
  readingsKun: string[];
  readingsOn: string[];
  gradeLevel: number | null;
  strokeCount: number;
  classicalRadicalNumber: number | null;
}

interface Kanjidic2MindTreeArtifact {
  artifactVersion: "nihongobridge-kanjidic2-mindtree-facts@1";
  source: {
    sourceRef: string;
    sourceVersion: string;
    archiveRepository: string;
    archiveCommit: string;
    archivePath: string;
    archiveBlobSha: string;
    archiveSha256: string;
    xmlSha256: string;
    license: string;
    attribution: string;
    licenseNotice: string;
    excludedFields: string[];
  };
  selectionPolicy: string;
  transformationVersion: "nihongobridge-kanjidic2-mindtree-extract@1";
  generatedAt: "reproducible";
  records: Kanjidic2MindTreeFact[];
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function argument(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Usage: --xml <verified-kanjidic2.xml> --kanjivg-archive <verified-kanjivg.tar.gz> --out <output.json>; missing ${flag}`);
  }
  return value;
}

function compareCharacters(left: string, right: string): number {
  return (left.codePointAt(0) ?? 0) - (right.codePointAt(0) ?? 0);
}

function toFact(raw: RawKanjidicCharacter): Kanjidic2MindTreeFact {
  const meaningsEnglish = raw.meanings
    .filter((meaning) => meaning.lang === "en")
    .map((meaning) => meaning.text.trim())
    .filter(Boolean);
  const strokeCount = raw.strokeCounts[0];
  if (!meaningsEnglish.length || !Number.isInteger(strokeCount) || strokeCount < 1) {
    throw new Error(`${raw.literal}: KANJIDIC2 English meaning or primary stroke count missing`);
  }
  return {
    character: raw.literal,
    meaningsEnglish,
    readingsKun: raw.readings.filter((reading) => reading.type === "ja_kun").map((reading) => reading.value),
    readingsOn: raw.readings.filter((reading) => reading.type === "ja_on").map((reading) => reading.value),
    gradeLevel: raw.grade,
    strokeCount,
    classicalRadicalNumber: raw.radicals.find((radical) => radical.type === "classical")?.value ?? null,
  };
}

async function main(): Promise<void> {
  const xmlPath = resolve(argument("--xml"));
  const kanjiVgArchivePath = resolve(argument("--kanjivg-archive"));
  const outputPath = resolve(argument("--out"));
  const xml = await readFile(xmlPath);
  scanAndVerifyKanjidic2Xml(xml, EXPECTED_KANJIDIC2_BYTES, EXPECTED_KANJIDIC2_SHA256);

  const kanjiVgArchive = await readFile(kanjiVgArchivePath);
  const kanjiVgDigest = sha256(kanjiVgArchive);
  if (kanjiVgDigest !== KANJIVG_ARCHIVE_SHA256) {
    throw new Error(`KanjiVG archive digest mismatch: expected ${KANJIVG_ARCHIVE_SHA256}, observed ${kanjiVgDigest}`);
  }
  const kanjiVgMembers = new Set(
    execFileSync("tar", ["-tzf", kanjiVgArchivePath], { maxBuffer: 8_000_000 })
      .toString("utf8")
      .split("\n")
      .filter((name) => name.startsWith(KANJIVG_ARCHIVE_ROOT) && name.endsWith(".svg")),
  );

  const firstPartyCharacters = new Set(KANJI.map((item) => item.character));
  const rawByCharacter = new Map<string, RawKanjidicCharacter>();
  const gradeOneCandidates: RawKanjidicCharacter[] = [];
  let parsedSourceRecords = 0;
  for await (const raw of streamKanjidicCharacters(createReadStream(xmlPath))) {
    parsedSourceRecords++;
    if (firstPartyCharacters.has(raw.literal)) rawByCharacter.set(raw.literal, raw);
    if (raw.grade === 1 && raw.meanings.some((meaning) => meaning.lang === "en" && meaning.text.trim())) {
      gradeOneCandidates.push(raw);
    }
  }

  if (parsedSourceRecords !== EXPECTED_KANJIDIC2_ENTRIES) {
    throw new Error(`KANJIDIC2 parsed-record count mismatch: expected ${EXPECTED_KANJIDIC2_ENTRIES}, got ${parsedSourceRecords}`);
  }
  const missingFirstParty = [...firstPartyCharacters].filter((character) => !rawByCharacter.has(character));
  if (missingFirstParty.length) throw new Error(`KANJIDIC2 records missing for first-party characters: ${missingFirstParty.join(" ")}`);

  const selected = new Set(firstPartyCharacters);
  const orderedCandidates = gradeOneCandidates
    .filter((raw) => !selected.has(raw.literal) && kanjiVgMembers.has(`${KANJIVG_ARCHIVE_ROOT}${raw.literal.codePointAt(0)!.toString(16).padStart(5, "0")}.svg`))
    .sort((left, right) => (left.strokeCounts[0] ?? Number.MAX_SAFE_INTEGER) - (right.strokeCounts[0] ?? Number.MAX_SAFE_INTEGER)
      || compareCharacters(left.literal, right.literal));
  for (const raw of orderedCandidates) {
    if (selected.size >= TARGET_COUNT) break;
    selected.add(raw.literal);
    rawByCharacter.set(raw.literal, raw);
  }
  if (selected.size !== TARGET_COUNT) {
    throw new Error(`Coverage expansion failed: expected ${TARGET_COUNT} source-backed characters, got ${selected.size}`);
  }

  const records = [...selected]
    .sort(compareCharacters)
    .map((character) => {
      const raw = rawByCharacter.get(character);
      if (!raw) throw new Error(`Missing selected KANJIDIC2 source record: ${character}`);
      const filename = `${KANJIVG_ARCHIVE_ROOT}${character.codePointAt(0)!.toString(16).padStart(5, "0")}.svg`;
      if (!kanjiVgMembers.has(filename)) throw new Error(`No pinned KanjiVG SVG for selected character: ${character}`);
      return toFact(raw);
    });

  if (records.length !== TARGET_COUNT || new Set(records.map((record) => record.character)).size !== TARGET_COUNT) {
    throw new Error("Generated KANJIDIC2 slice does not contain exactly 100 unique characters");
  }

  const artifact: Kanjidic2MindTreeArtifact = {
    artifactVersion: "nihongobridge-kanjidic2-mindtree-facts@1",
    source: {
      sourceRef: KANJIDIC2_SOURCE_ID,
      sourceVersion: `${EXPECTED_KANJIDIC2_RELEASE} / database 2023-232 / file version 4`,
      archiveRepository: `https://github.com/${KANJIDIC2_ARCHIVE_REPOSITORY}`,
      archiveCommit: KANJIDIC2_ARCHIVE_COMMIT,
      archivePath: KANJIDIC2_ARCHIVE_PATH,
      archiveBlobSha: KANJIDIC2_ARCHIVE_BLOB_SHA,
      archiveSha256: EXPECTED_KANJIDIC2_ARCHIVE_SHA256,
      xmlSha256: EXPECTED_KANJIDIC2_SHA256,
      license: MINDTREE_LICENSE,
      attribution: MINDTREE_ATTRIBUTION,
      licenseNotice: LICENSE_NOTICE,
      excludedFields: ["non-English meanings", "SKIP, Pinyin, Korean and other third-party reading/code material", "JMdict vocabulary and example sentences"],
    },
    selectionPolicy: "All 33 existing first-party MindTree characters plus KANJIDIC2 grade-1 characters ordered by primary stroke count then Unicode scalar value until 100 unique characters are reached; every selected character must also have a matching SVG in pinned KanjiVG r20240807.",
    transformationVersion: "nihongobridge-kanjidic2-mindtree-extract@1",
    generatedAt: "reproducible",
    records,
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`KANJIDIC2 XML SHA-256: ${sha256(xml)}`);
  console.log(`KANJIDIC2 records: ${records.length}; first-party overlap: ${firstPartyCharacters.size}; added grade-1 records: ${records.length - firstPartyCharacters.size}`);
  console.log(`Bytes: ${Buffer.byteLength(serialized, "utf8")}`);
  console.log(`Slice SHA-256: ${sha256(serialized)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "KANJIDIC2 MindTree slice generation failed");
  process.exitCode = 1;
});
