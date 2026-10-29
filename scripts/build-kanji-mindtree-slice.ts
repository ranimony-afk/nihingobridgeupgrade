import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KANJI } from "../src/data/kanji";
import {
  KANJIVG_ARCHIVE_SHA256,
  KANJIVG_ATTRIBUTION,
  KANJIVG_LICENSE,
  KANJIVG_SOURCE_REF,
  KANJIVG_SOURCE_VERSION,
  KANJIVG_TRANSFORMATION_VERSION,
  parseKanjiVgSvg,
  type KanjiVgSliceArtifact,
  type KanjiVgSliceRecord,
} from "../src/lib/kanji/kanjiVgSvgAdapter";
import { getKanjidic2MindTreeFacts, validateKanjidic2MindTreeFacts } from "../src/lib/kanji/kanjidic2MindtreeFacts";
import {
  canonicalizeStructuralEvidenceGraph,
  validateStructuralEvidenceGraph,
} from "../src/lib/kanji/structuralEvidenceGraph";

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function argument(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Usage: --archive <verified-kanjivg-tar.gz> --source-dir <extracted-kanji-dir> --out <output.json>; missing ${flag}`);
  }
  return value;
}

function codePointHex(character: string): string {
  return character.codePointAt(0)!.toString(16).padStart(5, "0");
}

async function main(): Promise<void> {
  const archivePath = resolve(argument("--archive"));
  const sourceDirectory = resolve(argument("--source-dir"));
  const outputPath = resolve(argument("--out"));
  const archive = await readFile(archivePath);
  const archiveDigest = sha256(archive);
  if (archiveDigest !== KANJIVG_ARCHIVE_SHA256) {
    throw new Error(`KanjiVG archive digest mismatch: expected ${KANJIVG_ARCHIVE_SHA256}, observed ${archiveDigest}`);
  }

  const factsValidation = validateKanjidic2MindTreeFacts();
  if (!factsValidation.valid) throw new Error(`KANJIDIC2 facts slice invalid: ${JSON.stringify(factsValidation.issues)}`);
  const facts = getKanjidic2MindTreeFacts();
  const selectedCharacters = facts.records.map((record) => record.character);
  const firstPartyCharacters = new Set(KANJI.map((kanji) => kanji.character));
  if ([...firstPartyCharacters].some((character) => !selectedCharacters.includes(character))) {
    throw new Error("The KANJIDIC2 source slice no longer includes every first-party MindTree character");
  }

  const records: KanjiVgSliceRecord[] = [];
  const seenCharacters = new Set<string>();
  for (const character of selectedCharacters) {
    if (seenCharacters.has(character)) throw new Error(`Duplicate MindTree glyph: ${character}`);
    seenCharacters.add(character);
    const filename = `${codePointHex(character)}.svg`;
    const bytes = await readFile(join(sourceDirectory, filename));
    const archiveMember = `kanjivg-r20240807/kanji/${filename}`;
    const archivedBytes = execFileSync("tar", ["-xOzf", archivePath, archiveMember], { maxBuffer: 1_000_000 });
    if (!archivedBytes.equals(bytes)) throw new Error(`${character}: extracted bytes differ from the pinned archive member`);
    const digest = sha256(bytes);
    const sourceFile = `kanji/${filename}`;
    const parsed = parseKanjiVgSvg({
      character,
      sourceFile,
      sourceFileSha256: digest,
      svgText: bytes.toString("utf8"),
    });
    const expected = {
      sourceRef: KANJIVG_SOURCE_REF,
      sourceVersion: KANJIVG_SOURCE_VERSION,
      declaredContentDigest: digest,
      transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
      license: KANJIVG_LICENSE,
      attribution: KANJIVG_ATTRIBUTION,
    };
    const validation = validateStructuralEvidenceGraph(parsed.graph, expected);
    if (!validation.valid) {
      throw new Error(`${character}: generated graph invalid: ${JSON.stringify(validation.issues)}`);
    }
    const canonical = canonicalizeStructuralEvidenceGraph(parsed.graph, expected);
    records.push({ ...parsed, graphCanonicalSha256: sha256(canonical) });
  }

  if (records.length !== 100) throw new Error(`Expected 100 source-backed kanji, found ${records.length}`);
  const artifact: KanjiVgSliceArtifact = {
    artifactVersion: "nihongobridge-kanjivg-slice@1",
    source: {
      sourceRef: KANJIVG_SOURCE_REF,
      sourceVersion: KANJIVG_SOURCE_VERSION,
      archiveSha256: KANJIVG_ARCHIVE_SHA256,
      license: KANJIVG_LICENSE,
      attribution: KANJIVG_ATTRIBUTION,
    },
    transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
    generatedAt: "reproducible",
    records,
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`KanjiVG archive SHA-256: ${archiveDigest}`);
  console.log(`Records: ${records.length}`);
  console.log(`Paths: ${records.reduce((sum, record) => sum + record.paths.length, 0)}`);
  console.log(`Bytes: ${Buffer.byteLength(serialized, "utf8")}`);
  console.log(`Slice SHA-256: ${sha256(serialized)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "KanjiVG slice generation failed");
  process.exitCode = 1;
});
