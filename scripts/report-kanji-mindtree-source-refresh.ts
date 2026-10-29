import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KANJIDIC2_MINDTREE_SLICE_SHA256, validateKanjidic2MindTreeFacts } from "../src/lib/kanji/kanjidic2MindtreeFacts";
import { validateMindTreeSlice } from "../src/lib/kanji/kanjiMindtreeCatalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPaths = {
  kanjivg: "src/data/kanji-mindtree/kanjivg-structure-slice.json",
  kanjidic2: "src/data/kanji-mindtree/kanjidic2-facts-slice.json",
} as const;
const expectedDigests = {
  kanjivg: "03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862",
  kanjidic2: KANJIDIC2_MINDTREE_SLICE_SHA256,
} as const;

function inspect(name: keyof typeof artifactPaths) {
  const bytes = readFileSync(resolve(root, artifactPaths[name]));
  const parsed = JSON.parse(bytes.toString("utf8")) as { records?: unknown[]; source?: { sourceVersion?: string; sourceRef?: string; license?: string } };
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    name,
    artifactPath: artifactPaths[name],
    bytes: bytes.byteLength,
    records: parsed.records?.length ?? 0,
    sourceRef: parsed.source?.sourceRef ?? null,
    sourceVersion: parsed.source?.sourceVersion ?? null,
    declaredLicense: parsed.source?.license ?? null,
    expectedSha256: expectedDigests[name],
    actualSha256,
    hashMatches: actualSha256 === expectedDigests[name],
  };
}

const artifacts = [inspect("kanjivg"), inspect("kanjidic2")];
const validations = {
  kanjivgAndJoinedSlice: validateMindTreeSlice(),
  kanjidic2Facts: validateKanjidic2MindTreeFacts(),
};
const valid = artifacts.every((artifact) => artifact.hashMatches)
  && validations.kanjivgAndJoinedSlice.valid
  && validations.kanjidic2Facts.valid;

console.log(JSON.stringify({
  reportVersion: "nihongobridge-mindtree-source-refresh-check@1",
  mode: "offline-local-integrity-report",
  outcome: valid ? "PASS_LOCAL_ARTIFACTS" : "BLOCKED_LOCAL_ARTIFACT_DRIFT",
  networkAccess: false,
  automaticIngestion: false,
  refreshPerformed: false,
  manualReviewRequired: true,
  artifacts,
  validations,
  requiredManualChecks: [
    "Check the current EDRDG license notice and update requirement at https://www.edrdg.org/edrdg/licence.html.",
    "Check upstream release/version metadata and immutable repository revisions for KANJIDIC2 and KanjiVG.",
    "Resolve license/provenance changes before any extraction; do not treat this local integrity report as source freshness or legal clearance.",
    "If source changes are approved, use the separately pinned, deterministic generators and review the resulting diff before updating expected hashes.",
  ],
}, null, 2));
if (!valid) process.exitCode = 1;
