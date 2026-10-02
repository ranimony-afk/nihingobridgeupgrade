/**
 * Immutable KANJIDIC2 CI provisioner.
 *
 * Downloads exactly one public GitHub blob, verifies it before decompression,
 * verifies the decompressed XML before exposing it to the existing KANJIDIC2
 * path, and never falls back to another source.
 */

import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import fs from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertOfficialKanjidic2Scan,
  EXPECTED_KANJIDIC2_ARCHIVE_BYTES,
  EXPECTED_KANJIDIC2_ARCHIVE_SHA256,
  EXPECTED_KANJIDIC2_BYTES,
  EXPECTED_KANJIDIC2_ENTRIES,
  EXPECTED_KANJIDIC2_RELEASE,
  EXPECTED_KANJIDIC2_SHA256,
  KANJIDIC2_ARCHIVE_BLOB_SHA,
  KANJIDIC2_ARCHIVE_COMMIT,
  KANJIDIC2_ARCHIVE_PATH,
  KANJIDIC2_ARCHIVE_REPOSITORY,
  Kanjidic2ByteScan,
} from "../src/etl/kanji/kanjidic2Contract";

export {
  KANJIDIC2_ARCHIVE_BLOB_SHA,
  KANJIDIC2_ARCHIVE_COMMIT,
  KANJIDIC2_ARCHIVE_PATH,
  KANJIDIC2_ARCHIVE_REPOSITORY,
};
export const KANJIDIC2_XML_OUTPUT = resolve(process.cwd(), "data/kanjidic2.xml");

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "NihongoBridge-KANJIDIC2-CI-Provisioner/1.0";
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": USER_AGENT,
};

interface GitTreeEntry {
  path?: string;
  type?: string;
  sha?: string;
}

interface GitTreeResponse {
  truncated?: boolean;
  tree?: GitTreeEntry[];
}

interface GitBlobResponse {
  sha?: string;
  size?: number;
  encoding?: string;
  content?: string;
}

export function gitBlobSha1(bytes: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertGitBlobIdentity(
  bytes: Buffer,
  advertisedSha = KANJIDIC2_ARCHIVE_BLOB_SHA,
  expectedSha = KANJIDIC2_ARCHIVE_BLOB_SHA,
): void {
  if (advertisedSha !== expectedSha) {
    throw new Error(
      `[KANJIDIC2 provision] GIT BLOB IDENTITY MISMATCH: API advertised ${advertisedSha}, expected ${expectedSha}`,
    );
  }
  const actualSha = gitBlobSha1(bytes);
  if (actualSha !== expectedSha) {
    throw new Error(
      `[KANJIDIC2 provision] GIT BLOB IDENTITY MISMATCH: computed ${actualSha}, expected ${expectedSha}`,
    );
  }
}

export function assertArchiveIdentity(
  archive: Buffer,
  expectedBytes = EXPECTED_KANJIDIC2_ARCHIVE_BYTES,
  expectedSha256 = EXPECTED_KANJIDIC2_ARCHIVE_SHA256,
): void {
  if (archive.length !== expectedBytes) {
    throw new Error(
      `[KANJIDIC2 provision] ARCHIVE SIZE MISMATCH: expected ${expectedBytes}, got ${archive.length}`,
    );
  }
  const actualSha256 = sha256(archive);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `[KANJIDIC2 provision] ARCHIVE SHA MISMATCH: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
}

export function decompressKanjidic2Archive(archive: Buffer): Buffer {
  try {
    return brotliDecompressSync(archive);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`[KANJIDIC2 provision] BROTLI DECOMPRESSION FAILED${detail}`);
  }
}

export function scanAndVerifyKanjidic2Xml(
  xml: Buffer,
  expectedBytes = EXPECTED_KANJIDIC2_BYTES,
  expectedSha256 = EXPECTED_KANJIDIC2_SHA256,
): void {
  if (xml.length !== expectedBytes) {
    throw new Error(
      `[KANJIDIC2 provision] XML SIZE MISMATCH: expected ${expectedBytes}, got ${xml.length}`,
    );
  }
  const actualSha256 = sha256(xml);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `[KANJIDIC2 provision] XML SHA MISMATCH: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }

  const scan = new Kanjidic2ByteScan();
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < xml.length; offset += chunkSize) {
    scan.feed(xml.subarray(offset, Math.min(offset + chunkSize, xml.length)));
  }
  // This performs the version check before the balanced-record and expected
  // count checks. It is intentionally the final validation before exposure.
  assertOfficialKanjidic2Scan(scan);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: GITHUB_HEADERS });
  if (!response.ok) {
    throw new Error(
      `[KANJIDIC2 provision] IMMUTABLE SOURCE RETRIEVAL FAILED: GitHub API ${response.status} for ${url}`,
    );
  }
  return (await response.json()) as T;
}

async function fetchPinnedArchive(): Promise<Buffer> {
  const base = `${GITHUB_API}/repos/${KANJIDIC2_ARCHIVE_REPOSITORY}`;
  const treeUrl = `${base}/git/trees/${KANJIDIC2_ARCHIVE_COMMIT}?recursive=1`;
  const tree = await fetchJson<GitTreeResponse>(treeUrl);
  if (tree.truncated) {
    throw new Error(
      "[KANJIDIC2 provision] IMMUTABLE SOURCE RETRIEVAL FAILED: pinned tree was truncated",
    );
  }
  const matches = (tree.tree ?? []).filter((entry) => entry.path === KANJIDIC2_ARCHIVE_PATH);
  if (
    matches.length !== 1 ||
    matches[0]?.type !== "blob" ||
    matches[0]?.sha !== KANJIDIC2_ARCHIVE_BLOB_SHA
  ) {
    throw new Error(
      `[KANJIDIC2 provision] IMMUTABLE SOURCE IDENTITY FAILED: ${KANJIDIC2_ARCHIVE_PATH} at ${KANJIDIC2_ARCHIVE_COMMIT} did not resolve to blob ${KANJIDIC2_ARCHIVE_BLOB_SHA}`,
    );
  }

  const blobUrl = `${base}/git/blobs/${KANJIDIC2_ARCHIVE_BLOB_SHA}`;
  const blob = await fetchJson<GitBlobResponse>(blobUrl);
  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new Error(
      "[KANJIDIC2 provision] IMMUTABLE SOURCE RETRIEVAL FAILED: blob was not base64 content",
    );
  }
  const archive = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  assertGitBlobIdentity(archive, blob.sha);
  if (blob.size !== archive.length) {
    throw new Error(
      `[KANJIDIC2 provision] GIT BLOB SIZE MISMATCH: API reported ${blob.size}, decoded ${archive.length}`,
    );
  }
  return archive;
}

export async function provisionKanjidic2Xml(outputPath = KANJIDIC2_XML_OUTPUT): Promise<void> {
  // Remove a stale output before retrieval. A failed run must never leave an
  // older corpus available for a later KANJIDIC2 test.
  await rm(outputPath, { force: true });
  const archive = await fetchPinnedArchive();
  assertArchiveIdentity(archive);
  const xml = decompressKanjidic2Archive(archive);
  scanAndVerifyKanjidic2Xml(xml);

  await mkdir(resolve(outputPath, ".."), { recursive: true });
  const temporaryOutput = `${outputPath}.tmp-${process.pid}`;
  await rm(temporaryOutput, { force: true });
  try {
    await writeFile(temporaryOutput, xml, { flag: "wx" });
    await rename(temporaryOutput, outputPath);
  } finally {
    await rm(temporaryOutput, { force: true });
  }
  console.log(
    `[KANJIDIC2 provision] verified ${KANJIDIC2_ARCHIVE_REPOSITORY}@${KANJIDIC2_ARCHIVE_COMMIT}:${KANJIDIC2_ARCHIVE_PATH} ` +
      `(blob ${KANJIDIC2_ARCHIVE_BLOB_SHA}, archive ${archive.length} bytes, XML ${xml.length} bytes, ` +
      `release ${EXPECTED_KANJIDIC2_RELEASE}, entries ${EXPECTED_KANJIDIC2_ENTRIES})`,
  );
}

export function isProvisionerEntryPoint(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === resolve(new URL(import.meta.url).pathname));
}

if (isProvisionerEntryPoint()) {
  provisionKanjidic2Xml().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

// Keep fs imported only for a fail-closed existence assertion in tests and to
// make the no-output-on-failure invariant easy to inspect without a network.
export function outputExists(path = KANJIDIC2_XML_OUTPUT): boolean {
  return fs.existsSync(path);
}
