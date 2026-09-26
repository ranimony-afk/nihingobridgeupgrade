/**
 * Direct tests for immutable JMdict CI acquisition. These tests use synthetic
 * bytes and mocked GitHub responses; they never download or retain the corpus.
 */
import { brotliCompressSync } from "node:zlib";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertArchiveIdentity,
  assertGitBlobIdentity,
  decompressJmdictArchive,
  JMDICT_ARCHIVE_BLOB_SHA,
  JMDICT_ARCHIVE_COMMIT,
  JMDICT_ARCHIVE_PATH,
  gitBlobSha1,
  outputExists,
  provisionJmdictXml,
  sha256,
  scanAndVerifyJmdictXml,
} from "../scripts/provision-jmdict-ci";

const temporaryPaths: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryPaths.splice(0)) fs.rmSync(path, { force: true });
});

describe("immutable JMdict provisioning", () => {
  it("accepts matching Git blob and archive identities and decompresses Brotli", () => {
    const archive = Buffer.from("synthetic archive bytes");
    const blobSha = gitBlobSha1(archive);
    expect(() => assertGitBlobIdentity(archive, blobSha, blobSha)).not.toThrow();
    expect(() => assertArchiveIdentity(archive, archive.length, sha256(archive))).not.toThrow();
    expect(() => assertArchiveIdentity(archive, archive.length, "0".repeat(64))).toThrow(
      /ARCHIVE SHA MISMATCH/,
    );

    const compressed = brotliCompressSync(archive);
    expect(decompressJmdictArchive(compressed)).toEqual(archive);
  });

  it("rejects identity, size, hash, XML, and Brotli mismatches before exposure", () => {
    const bytes = Buffer.from("not the pinned blob");
    expect(() => assertGitBlobIdentity(bytes, gitBlobSha1(bytes), "0".repeat(40))).toThrow(
      /GIT BLOB IDENTITY MISMATCH/,
    );
    expect(() => assertArchiveIdentity(bytes, bytes.length + 1, "0".repeat(64))).toThrow(
      /ARCHIVE SIZE MISMATCH/,
    );
    expect(() => assertArchiveIdentity(bytes, bytes.length, "0".repeat(64))).toThrow(
      /ARCHIVE SHA MISMATCH/,
    );
    expect(() => decompressJmdictArchive(bytes)).toThrow(/BROTLI DECOMPRESSION FAILED/);
    expect(() => scanAndVerifyJmdictXml(bytes, bytes.length, "0".repeat(64))).toThrow(
      /XML SHA MISMATCH/,
    );
  });

  it("fails closed when the pinned blob payload is corrupt and leaves no output", async () => {
    const output = join(tmpdir(), `jmdict-provision-${process.pid}.xml`);
    const corrupt = Buffer.from("corrupt");
    temporaryPaths.push(output);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [{ path: JMDICT_ARCHIVE_PATH, type: "blob", sha: JMDICT_ARCHIVE_BLOB_SHA }],
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sha: "127cbaae0ce21dfe95adaaa5feb180b1fcb11d2c",
        size: corrupt.length,
        encoding: "base64",
        content: corrupt.toString("base64"),
      }),
    } as Response);

    await expect(provisionJmdictXml(output)).rejects.toThrow(/GIT BLOB IDENTITY MISMATCH/);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/git/trees/${JMDICT_ARCHIVE_COMMIT}?recursive=1`);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/git/blobs/${JMDICT_ARCHIVE_BLOB_SHA}`);
    expect(outputExists(output)).toBe(false);
  });
});
