/**
 * Immutable JMdict CI provisioner.
 *
 * Downloads exactly one public GitHub blob, verifies it before decompression,
 * verifies the decompressed XML before exposing it to the existing JMdict
 * path, and never falls back to another source.
 */

import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import fs from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertOfficialSourceScan,
  EXPECTED_JMDICT_ARCHIVE_BYTES,
  EXPECTED_JMDICT_ARCHIVE_SHA256,
  EXPECTED_JMDICT_BYTES,
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_RELEASE,
  EXPECTED_JMDICT_SHA256,
  JMDICT_ARCHIVE_BLOB_SHA,
  JMDICT_ARCHIVE_COMMIT,
  JMDICT_ARCHIVE_PATH,
  JMDICT_ARCHIVE_REPOSITORY,
  JmdictByteScan,
} from "../src/etl/dictionary/jmdictContract";

export { JMDICT_ARCHIVE_BLOB_SHA, JMDICT_ARCHIVE_COMMIT, JMDICT_ARCHIVE_PATH, JMDICT_ARCHIVE_REPOSITORY };
export const JMDICT_XML_OUTPUT = resolve(process.cwd(), "data/JMdict.xml");

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "NihongoBridge-JMdict-CI-Provisioner/1.0";
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
  advertisedSha = JMDICT_ARCHIVE_BLOB_SHA,
  expectedSha = JMDICT_ARCHIVE_BLOB_SHA,
): void {
  if (advertisedSha !== expectedSha) {
    throw new Error(
      `[JMdict provision] GIT BLOB IDENTITY MISMATCH: API advertised ${advertisedSha}, expected ${expectedSha}`,
    );
  }
  const actualSha = gitBlobSha1(bytes);
  if (actualSha !== expectedSha) {
    throw new Error(
      `[JMdict provision] GIT BLOB IDENTITY MISMATCH: computed ${actualSha}, expected ${expectedSha}`,
    );
  }
}

export function assertArchiveIdentity(
  archive: Buffer,
  expectedBytes = EXPECTED_JMDICT_ARCHIVE_BYTES,
  expectedSha256 = EXPECTED_JMDICT_ARCHIVE_SHA256,
): void {
  if (archive.length !== expectedBytes) {
    throw new Error(
      `[JMdict provision] ARCHIVE SIZE MISMATCH: expected ${expectedBytes}, got ${archive.length}`,
    );
  }
  const actualSha256 = sha256(archive);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `[JMdict provision] ARCHIVE SHA MISMATCH: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
}

export function decompressJmdictArchive(archive: Buffer): Buffer {
  try {
    return brotliDecompressSync(archive);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`[JMdict provision] BROTLI DECOMPRESSION FAILED${detail}`);
  }
}

export function scanAndVerifyJmdictXml(
  xml: Buffer,
  expectedBytes = EXPECTED_JMDICT_BYTES,
  expectedSha256 = EXPECTED_JMDICT_SHA256,
): void {
  if (xml.length !== expectedBytes) {
    throw new Error(
      `[JMdict provision] XML SIZE MISMATCH: expected ${expectedBytes}, got ${xml.length}`,
    );
  }
  const actualSha256 = sha256(xml);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `[JMdict provision] XML SHA MISMATCH: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }

  const scan = new JmdictByteScan();
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < xml.length; offset += chunkSize) {
    scan.feed(xml.subarray(offset, Math.min(offset + chunkSize, xml.length)));
  }
  // This performs the release check before the balanced-entry and expected
  // count checks. It is intentionally the final validation before exposure.
  assertOfficialSourceScan(scan);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: GITHUB_HEADERS });
  if (!response.ok) {
    throw new Error(
      `[JMdict provision] IMMUTABLE SOURCE RETRIEVAL FAILED: GitHub API ${response.status} for ${url}`,
    );
  }
  return (await response.json()) as T;
}

async function fetchPinnedArchive(): Promise<Buffer> {
  const base = `${GITHUB_API}/repos/${JMDICT_ARCHIVE_REPOSITORY}`;
  const treeUrl = `${base}/git/trees/${JMDICT_ARCHIVE_COMMIT}?recursive=1`;
  const tree = await fetchJson<GitTreeResponse>(treeUrl);
  if (tree.truncated) {
    throw new Error("[JMdict provision] IMMUTABLE SOURCE RETRIEVAL FAILED: pinned tree was truncated");
  }
  const matches = (tree.tree ?? []).filter((entry) => entry.path === JMDICT_ARCHIVE_PATH);
  if (
    matches.length !== 1 ||
    matches[0]?.type !== "blob" ||
    matches[0]?.sha !== JMDICT_ARCHIVE_BLOB_SHA
  ) {
    throw new Error(
      `[JMdict provision] IMMUTABLE SOURCE IDENTITY FAILED: ${JMDICT_ARCHIVE_PATH} at ${JMDICT_ARCHIVE_COMMIT} did not resolve to blob ${JMDICT_ARCHIVE_BLOB_SHA}`,
    );
  }

  const blobUrl = `${base}/git/blobs/${JMDICT_ARCHIVE_BLOB_SHA}`;
  const blob = await fetchJson<GitBlobResponse>(blobUrl);
  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new Error("[JMdict provision] IMMUTABLE SOURCE RETRIEVAL FAILED: blob was not base64 content");
  }
  const archive = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  assertGitBlobIdentity(archive, blob.sha);
  if (blob.size !== archive.length) {
    throw new Error(
      `[JMdict provision] GIT BLOB SIZE MISMATCH: API reported ${blob.size}, decoded ${archive.length}`,
    );
  }
  return archive;
}

export async function provisionJmdictXml(outputPath = JMDICT_XML_OUTPUT): Promise<void> {
  // Remove a stale output before retrieval. A failed run must never leave an
  // older corpus available for a later JMdict test.
  await rm(outputPath, { force: true });
  const archive = await fetchPinnedArchive();
  assertArchiveIdentity(archive);
  const xml = decompressJmdictArchive(archive);
  scanAndVerifyJmdictXml(xml);

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
    `[JMdict provision] verified ${JMDICT_ARCHIVE_REPOSITORY}@${JMDICT_ARCHIVE_COMMIT}:${JMDICT_ARCHIVE_PATH} ` +
      `(blob ${JMDICT_ARCHIVE_BLOB_SHA}, archive ${archive.length} bytes, XML ${xml.length} bytes, ` +
      `release ${EXPECTED_JMDICT_RELEASE}, entries ${EXPECTED_JMDICT_ENTRIES})`,
  );
}

export function isProvisionerEntryPoint(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === resolve(new URL(import.meta.url).pathname));
}

if (isProvisionerEntryPoint()) {
  provisionJmdictXml().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

// Keep fs imported only for a fail-closed existence assertion in tests and to
// make the no-output-on-failure invariant easy to inspect without a network.
export function outputExists(path = JMDICT_XML_OUTPUT): boolean {
  return fs.existsSync(path);
}
