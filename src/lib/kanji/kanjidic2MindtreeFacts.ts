import { createHash } from "node:crypto";
import factsJson from "@/data/kanji-mindtree/kanjidic2-facts-slice.json";

export const KANJIDIC2_MINDTREE_ARTIFACT_VERSION = "nihongobridge-kanjidic2-mindtree-facts@1" as const;
export const KANJIDIC2_MINDTREE_SOURCE_REF = "upstream:kanjidic2:2023-08" as const;
export const KANJIDIC2_MINDTREE_SOURCE_VERSION = "2023-08-20 / database 2023-232 / file version 4" as const;
export const KANJIDIC2_MINDTREE_ARCHIVE_COMMIT = "9cb709b87f43c7bceb494eefbe7f8b8f42744502" as const;
export const KANJIDIC2_MINDTREE_ARCHIVE_BLOB_SHA = "e6e448946b29480a765f167e9ee1cc3fc9314c6b" as const;
export const KANJIDIC2_MINDTREE_ARCHIVE_SHA256 = "175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb" as const;
export const KANJIDIC2_MINDTREE_XML_SHA256 = "260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781" as const;
export const KANJIDIC2_MINDTREE_LICENSE = "CC-BY-SA-4.0" as const;
export const KANJIDIC2_MINDTREE_ATTRIBUTION =
  "KANJIDIC2, compiled and maintained by the Electronic Dictionary Research and Development Group (EDRDG). https://www.edrdg.org/wiki/index.php/KANJIDIC2" as const;
export const KANJIDIC2_MINDTREE_LICENSE_NOTICE = "https://www.edrdg.org/edrdg/licence.html" as const;
export const KANJIDIC2_MINDTREE_SLICE_SHA256 = "4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6" as const;
export const KANJIDIC2_MINDTREE_TRANSFORMATION_VERSION = "nihongobridge-kanjidic2-mindtree-extract@1" as const;

export interface Kanjidic2MindTreeFact {
  character: string;
  meaningsEnglish: string[];
  readingsKun: string[];
  readingsOn: string[];
  gradeLevel: number | null;
  strokeCount: number;
  classicalRadicalNumber: number | null;
}

export interface Kanjidic2MindTreeArtifact {
  artifactVersion: typeof KANJIDIC2_MINDTREE_ARTIFACT_VERSION;
  source: {
    sourceRef: typeof KANJIDIC2_MINDTREE_SOURCE_REF;
    sourceVersion: typeof KANJIDIC2_MINDTREE_SOURCE_VERSION;
    archiveRepository: string;
    archiveCommit: typeof KANJIDIC2_MINDTREE_ARCHIVE_COMMIT;
    archivePath: string;
    archiveBlobSha: typeof KANJIDIC2_MINDTREE_ARCHIVE_BLOB_SHA;
    archiveSha256: typeof KANJIDIC2_MINDTREE_ARCHIVE_SHA256;
    xmlSha256: typeof KANJIDIC2_MINDTREE_XML_SHA256;
    license: typeof KANJIDIC2_MINDTREE_LICENSE;
    attribution: typeof KANJIDIC2_MINDTREE_ATTRIBUTION;
    licenseNotice: typeof KANJIDIC2_MINDTREE_LICENSE_NOTICE;
    excludedFields: string[];
  };
  selectionPolicy: string;
  transformationVersion: typeof KANJIDIC2_MINDTREE_TRANSFORMATION_VERSION;
  generatedAt: "reproducible";
  records: Kanjidic2MindTreeFact[];
}

const artifact = factsJson as unknown as Kanjidic2MindTreeArtifact;

export function validateKanjidic2MindTreeFacts(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!artifact || artifact.artifactVersion !== KANJIDIC2_MINDTREE_ARTIFACT_VERSION) {
    return { valid: false, issues: ["KANJIDIC2 facts artifact version mismatch"] };
  }
  if (
    artifact.source.sourceRef !== KANJIDIC2_MINDTREE_SOURCE_REF
    || artifact.source.sourceVersion !== KANJIDIC2_MINDTREE_SOURCE_VERSION
    || artifact.source.archiveCommit !== KANJIDIC2_MINDTREE_ARCHIVE_COMMIT
    || artifact.source.archiveBlobSha !== KANJIDIC2_MINDTREE_ARCHIVE_BLOB_SHA
    || artifact.source.archiveSha256 !== KANJIDIC2_MINDTREE_ARCHIVE_SHA256
    || artifact.source.xmlSha256 !== KANJIDIC2_MINDTREE_XML_SHA256
    || artifact.source.license !== KANJIDIC2_MINDTREE_LICENSE
    || artifact.source.attribution !== KANJIDIC2_MINDTREE_ATTRIBUTION
    || artifact.source.licenseNotice !== KANJIDIC2_MINDTREE_LICENSE_NOTICE
    || artifact.transformationVersion !== KANJIDIC2_MINDTREE_TRANSFORMATION_VERSION
  ) issues.push("KANJIDIC2 facts source or transformation pin mismatch");
  if (artifact.source.archivePath !== "kanjidic2_xml/kanjidic2.xml.br") issues.push("KANJIDIC2 archive path mismatch");
  if (artifact.source.archiveRepository !== "https://github.com/Jitendex/edrdg-dictionary-archive") issues.push("KANJIDIC2 archive repository mismatch");
  if (!Array.isArray(artifact.records) || artifact.records.length !== 100) {
    return { valid: false, issues: [...issues, "KANJIDIC2 facts slice must contain exactly 100 records"] };
  }
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const digest = createHash("sha256").update(serialized, "utf8").digest("hex");
  if (digest !== KANJIDIC2_MINDTREE_SLICE_SHA256) issues.push("KANJIDIC2 facts artifact digest mismatch");

  const seen = new Set<string>();
  let previousCodePoint = -1;
  for (const record of artifact.records) {
    if (typeof record.character !== "string" || Array.from(record.character).length !== 1) {
      issues.push("invalid KANJIDIC2 facts character");
      continue;
    }
    const codePoint = record.character.codePointAt(0)!;
    if (seen.has(record.character)) issues.push(`duplicate KANJIDIC2 facts character: ${record.character}`);
    if (codePoint <= previousCodePoint) issues.push("KANJIDIC2 facts are not in code-point order");
    seen.add(record.character);
    previousCodePoint = codePoint;
    if (!Array.isArray(record.meaningsEnglish) || record.meaningsEnglish.length === 0 || record.meaningsEnglish.some((meaning) => typeof meaning !== "string" || !meaning.trim())) {
      issues.push(`missing English meaning for ${record.character}`);
    }
    if (!Array.isArray(record.readingsKun) || !Array.isArray(record.readingsOn)) issues.push(`invalid readings for ${record.character}`);
    if (!Number.isInteger(record.strokeCount) || record.strokeCount < 1) issues.push(`invalid stroke count for ${record.character}`);
    if (record.gradeLevel !== null && (!Number.isInteger(record.gradeLevel) || record.gradeLevel < 1)) issues.push(`invalid grade for ${record.character}`);
    if (record.classicalRadicalNumber !== null && (!Number.isInteger(record.classicalRadicalNumber) || record.classicalRadicalNumber < 1)) {
      issues.push(`invalid classical radical number for ${record.character}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function getKanjidic2MindTreeFacts(): Kanjidic2MindTreeArtifact {
  return artifact;
}
