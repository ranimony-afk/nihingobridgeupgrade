/**
 * Direct tests for immutable KANJIDIC2 CI acquisition. These tests use synthetic
 * bytes and mocked GitHub responses; they never download or retain the corpus.
 *
 * The negative paths prove fail-closed behaviour: forged or wrong source
 * identities, checksum and size mismatches, version mismatches, and entry-count
 * mismatches must all refuse exposure, and a failed run must leave no output.
 */
import { brotliCompressSync } from "node:zlib";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertArchiveIdentity,
  assertGitBlobIdentity,
  decompressKanjidic2Archive,
  gitBlobSha1,
  KANJIDIC2_ARCHIVE_BLOB_SHA,
  KANJIDIC2_ARCHIVE_COMMIT,
  KANJIDIC2_ARCHIVE_PATH,
  outputExists,
  provisionKanjidic2Xml,
  scanAndVerifyKanjidic2Xml,
  sha256,
} from "../scripts/provision-kanjidic2-ci";
import {
  assertOfficialKanjidicByteSize,
  assertOfficialKanjidicEntryCount,
  assertOfficialKanjidic2Scan,
  assertPinnedKanjidic2Source,
  EXPECTED_KANJIDIC2_ARCHIVE_BYTES,
  EXPECTED_KANJIDIC2_ARCHIVE_SHA256,
  EXPECTED_KANJIDIC2_BYTES,
  EXPECTED_KANJIDIC2_DATABASE_VERSION,
  EXPECTED_KANJIDIC2_ENTRIES,
  EXPECTED_KANJIDIC2_FILE_VERSION,
  EXPECTED_KANJIDIC2_RELEASE,
  EXPECTED_KANJIDIC2_SHA256,
  KANJIDIC2_SOURCE_ID,
  Kanjidic2ByteScan,
  REJECTED_KANJIDIC2_SOURCE_ID,
} from "../src/etl/kanji/kanjidic2Contract";

const temporaryPaths: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryPaths.splice(0)) fs.rmSync(path, { force: true });
});

function makeKanjidicXml(options?: {
  declaration?: boolean;
  root?: boolean;
  fileVersion?: string;
  databaseVersion?: string;
  dateOfCreation?: string;
  openCharacters?: number;
  closeCharacters?: number;
  literals?: number;
}): Buffer {
  const {
    declaration = true,
    root = true,
    fileVersion = EXPECTED_KANJIDIC2_FILE_VERSION,
    databaseVersion = EXPECTED_KANJIDIC2_DATABASE_VERSION,
    dateOfCreation = EXPECTED_KANJIDIC2_RELEASE,
    openCharacters = 2,
    closeCharacters = 2,
    literals = 2,
  } = options ?? {};
  const characters = Array.from({ length: openCharacters }, (_, i) => {
    const literal = i < literals ? `<literal>字${i}</literal>\n` : "";
    const close = i < closeCharacters ? "</character>\n" : "";
    return `<character>\n${literal}${close}`;
  }).join("");
  return Buffer.from(
    `${declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ""}` +
      `<!DOCTYPE kanjidic2 [\n<!ELEMENT kanjidic2 (header,character*)>\n]>\n` +
      `${root ? "<kanjidic2>\n" : ""}` +
      `<header>\n` +
      `<file_version>${fileVersion}</file_version>\n` +
      `<database_version>${databaseVersion}</database_version>\n` +
      `<date_of_creation>${dateOfCreation}</date_of_creation>\n` +
      `</header>\n` +
      characters +
      `${root ? "</kanjidic2>\n" : ""}`,
    "utf8",
  );
}

function scanBuffer(xml: Buffer): Kanjidic2ByteScan {
  const scan = new Kanjidic2ByteScan();
  // Deliberately odd chunking to exercise needle and header carry boundaries.
  for (let offset = 0; offset < xml.length; offset += 97) {
    scan.feed(xml.subarray(offset, Math.min(offset + 97, xml.length)));
  }
  return scan;
}

describe("immutable KANJIDIC2 provisioning", () => {
  it("locks the resolved archive identity and accepts matching Git blob and archive identities with Brotli", () => {
    // The resolved commit/blob identity recorded in the contract — the
    // unpinned manifest URL must never stand in for these values.
    expect(KANJIDIC2_ARCHIVE_COMMIT).toBe("9cb709b87f43c7bceb494eefbe7f8b8f42744502");
    expect(KANJIDIC2_ARCHIVE_BLOB_SHA).toBe("e6e448946b29480a765f167e9ee1cc3fc9314c6b");
    expect(KANJIDIC2_ARCHIVE_PATH).toBe("kanjidic2_xml/kanjidic2.xml.br");
    expect(EXPECTED_KANJIDIC2_ARCHIVE_BYTES).toBe(895754);
    expect(EXPECTED_KANJIDIC2_ARCHIVE_SHA256).toBe(
      "175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb",
    );
    expect(EXPECTED_KANJIDIC2_BYTES).toBe(15643593);
    expect(EXPECTED_KANJIDIC2_SHA256).toBe(
      "260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781",
    );
    expect(EXPECTED_KANJIDIC2_ENTRIES).toBe(13108);
    expect(EXPECTED_KANJIDIC2_RELEASE).toBe("2023-08-20");
    expect(EXPECTED_KANJIDIC2_FILE_VERSION).toBe("4");
    expect(EXPECTED_KANJIDIC2_DATABASE_VERSION).toBe("2023-232");
    expect(() => assertPinnedKanjidic2Source(KANJIDIC2_SOURCE_ID)).not.toThrow();

    const archive = Buffer.from("synthetic archive bytes");
    const blobSha = gitBlobSha1(archive);
    expect(() => assertGitBlobIdentity(archive, blobSha, blobSha)).not.toThrow();
    expect(() => assertArchiveIdentity(archive, archive.length, sha256(archive))).not.toThrow();
    expect(() => assertArchiveIdentity(archive, archive.length, "0".repeat(64))).toThrow(
      /ARCHIVE SHA MISMATCH/,
    );

    const compressed = brotliCompressSync(archive);
    expect(decompressKanjidic2Archive(compressed)).toEqual(archive);
  });

  it("rejects forged and wrong source identities fail-closed", () => {
    expect(() => assertPinnedKanjidic2Source(REJECTED_KANJIDIC2_SOURCE_ID)).toThrow(
      /refusing KANJIDIC2 2024-07/,
    );
    for (const forged of [
      "upstream:kanjidic2:latest",
      "upstream:kanjidic2:2023-08 ",
      "https://github.com/Jitendex/edrdg-dictionary-archive/blob/main/kanjidic2_xml/kanjidic2.xml.br",
      "",
    ]) {
      expect(() => assertPinnedKanjidic2Source(forged)).toThrow(/unpinned source/);
    }

    const bytes = Buffer.from("not the pinned blob");
    // API advertises a forged blob SHA.
    expect(() => assertGitBlobIdentity(bytes, "a".repeat(40), "b".repeat(40))).toThrow(
      /GIT BLOB IDENTITY MISMATCH: API advertised/,
    );
    // Advertised SHA is pinned, but the payload computes to a different blob.
    expect(() => assertGitBlobIdentity(bytes, gitBlobSha1(bytes), "0".repeat(40))).toThrow(
      /GIT BLOB IDENTITY MISMATCH/,
    );
    expect(() => assertGitBlobIdentity(bytes, "0".repeat(40), "0".repeat(40))).toThrow(
      /GIT BLOB IDENTITY MISMATCH: computed/,
    );
  });

  it("rejects identity, size, hash, XML, and Brotli mismatches before exposure", () => {
    const bytes = Buffer.from("not the pinned blob");
    expect(() => assertArchiveIdentity(bytes, bytes.length + 1, "0".repeat(64))).toThrow(
      /ARCHIVE SIZE MISMATCH/,
    );
    expect(() => assertArchiveIdentity(bytes, bytes.length, "0".repeat(64))).toThrow(
      /ARCHIVE SHA MISMATCH/,
    );
    expect(() => decompressKanjidic2Archive(bytes)).toThrow(/BROTLI DECOMPRESSION FAILED/);
    expect(() => scanAndVerifyKanjidic2Xml(bytes, bytes.length + 1, sha256(bytes))).toThrow(
      /XML SIZE MISMATCH/,
    );
    expect(() => scanAndVerifyKanjidic2Xml(bytes, bytes.length, "0".repeat(64))).toThrow(
      /XML SHA MISMATCH/,
    );
  });

  it("rejects version and entry-count mismatches fail-closed", () => {
    // Well-formed synthetic passes every gate except the 13,108-record count.
    expect(() => assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml()))).toThrow(
      /SOURCE COUNT MISMATCH: expected 13108, got 2/,
    );
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ dateOfCreation: "2024-07-20" }))),
    ).toThrow(/SOURCE RELEASE MISMATCH: date_of_creation 2024-07-20/);
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ dateOfCreation: "" }))),
    ).toThrow(/SOURCE RELEASE MISMATCH: official header date_of_creation missing/);
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ fileVersion: "3" }))),
    ).toThrow(/SOURCE VERSION MISMATCH: file_version 3/);
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ databaseVersion: "2024-245" }))),
    ).toThrow(/SOURCE VERSION MISMATCH: database_version 2024-245/);
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ closeCharacters: 1 }))),
    ).toThrow(/MALFORMED SOURCE: character tags are not balanced \(2\/1\/2\)/);
    expect(() =>
      assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ literals: 1 }))),
    ).toThrow(/MALFORMED SOURCE: character tags are not balanced \(2\/2\/1\)/);
    expect(() => assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ declaration: false })))).toThrow(
      /MALFORMED SOURCE/,
    );
    expect(() => assertOfficialKanjidic2Scan(scanBuffer(makeKanjidicXml({ root: false })))).toThrow(
      /MALFORMED SOURCE/,
    );
    expect(() => assertOfficialKanjidicEntryCount(EXPECTED_KANJIDIC2_ENTRIES - 1)).toThrow(
      /SOURCE COUNT MISMATCH/,
    );
    expect(() => assertOfficialKanjidicEntryCount(EXPECTED_KANJIDIC2_ENTRIES)).not.toThrow();
    expect(() => assertOfficialKanjidicByteSize(EXPECTED_KANJIDIC2_BYTES - 1)).toThrow(
      /SOURCE SIZE MISMATCH/,
    );
    expect(() => assertOfficialKanjidicByteSize(EXPECTED_KANJIDIC2_BYTES)).not.toThrow();
  });

  it("fails closed when the pinned tree resolves a forged blob identity and leaves no output", async () => {
    const output = join(tmpdir(), `kanjidic2-provision-tree-${process.pid}.xml`);
    temporaryPaths.push(output);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [{ path: KANJIDIC2_ARCHIVE_PATH, type: "blob", sha: "0".repeat(40) }],
      }),
    } as Response);

    await expect(provisionKanjidic2Xml(output)).rejects.toThrow(/IMMUTABLE SOURCE IDENTITY FAILED/);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/git/trees/${KANJIDIC2_ARCHIVE_COMMIT}?recursive=1`);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("blob/main");
    expect(outputExists(output)).toBe(false);
  });

  it("fails closed when the pinned blob payload is corrupt and leaves no output", async () => {
    const output = join(tmpdir(), `kanjidic2-provision-${process.pid}.xml`);
    const corrupt = Buffer.from("corrupt");
    temporaryPaths.push(output);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [{ path: KANJIDIC2_ARCHIVE_PATH, type: "blob", sha: KANJIDIC2_ARCHIVE_BLOB_SHA }],
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sha: KANJIDIC2_ARCHIVE_BLOB_SHA,
        size: corrupt.length,
        encoding: "base64",
        content: corrupt.toString("base64"),
      }),
    } as Response);

    await expect(provisionKanjidic2Xml(output)).rejects.toThrow(/GIT BLOB IDENTITY MISMATCH/);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/git/trees/${KANJIDIC2_ARCHIVE_COMMIT}?recursive=1`);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/git/blobs/${KANJIDIC2_ARCHIVE_BLOB_SHA}`);
    expect(outputExists(output)).toBe(false);
  });
});
