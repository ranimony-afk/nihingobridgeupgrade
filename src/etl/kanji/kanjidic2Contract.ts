/**
 * Pinned KANJIDIC2 2023-08 contract for Phase 14.4B.
 *
 * The test-locked acquisition manifest
 * (reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json) fixes the
 * XML identity of the verified release. This module additionally pins the
 * immutable archive identity — repository commit + Git blob — resolved from
 * Jitendex/edrdg-dictionary-archive for `kanjidic2_xml/kanjidic2.xml.br`.
 *
 * The manifest's `archiveRepositoryUrl` is an unpinned `blob/main/` URL and is
 * provenance documentation only: it must never be fetched. Acquisition goes
 * exclusively through the pinned commit/blob identity below, exactly as the
 * JMdict path does.
 *
 * This is the only release the acquisition path may verify. KANJIDIC2 2024-07
 * remains in the provenance registry for older callers and must not be
 * substituted here.
 */

export const KANJIDIC2_SOURCE_ID = "upstream:kanjidic2:2023-08";
export const REJECTED_KANJIDIC2_SOURCE_ID = "upstream:kanjidic2:2024-07";
export const EXPECTED_KANJIDIC2_RELEASE = "2023-08-20";
export const EXPECTED_KANJIDIC2_DATABASE_VERSION = "2023-232";
export const EXPECTED_KANJIDIC2_FILE_VERSION = "4";
export const KANJIDIC2_ARCHIVE_REPOSITORY = "Jitendex/edrdg-dictionary-archive";
export const KANJIDIC2_ARCHIVE_COMMIT = "9cb709b87f43c7bceb494eefbe7f8b8f42744502";
export const KANJIDIC2_ARCHIVE_PATH = "kanjidic2_xml/kanjidic2.xml.br";
export const KANJIDIC2_ARCHIVE_BLOB_SHA = "e6e448946b29480a765f167e9ee1cc3fc9314c6b";
export const KANJIDIC2_LICENSE = "CC-BY-SA-3.0";
export const KANJIDIC2_EDRDG_ATTRIBUTION =
  "Electronic Dictionary Research and Development Group (EDRDG)";
export const KANJIDIC2_LICENSE_QUALIFICATION =
  "Many translations of Japanese words into languages other than English are separately copyrighted by their authors and are not covered by this license.";
export const EXPECTED_KANJIDIC2_ENTRIES = 13108;
export const EXPECTED_KANJIDIC2_BYTES = 15643593;
export const EXPECTED_KANJIDIC2_SHA256 =
  "260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781";
export const EXPECTED_KANJIDIC2_ARCHIVE_SHA256 =
  "175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb";
export const EXPECTED_KANJIDIC2_ARCHIVE_BYTES = 895754;

export function assertPinnedKanjidic2Source(sourceId: string): void {
  if (sourceId === REJECTED_KANJIDIC2_SOURCE_ID) {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — refusing KANJIDIC2 2024-07. The pinned release is upstream:kanjidic2:2023-08.",
    );
  }
  if (sourceId !== KANJIDIC2_SOURCE_ID) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — refusing unpinned source "${sourceId}". Expected ${KANJIDIC2_SOURCE_ID}.`,
    );
  }
}

/** Official version check against the KANJIDIC2 `<header>` element values. */
export function assertOfficialKanjidic2Versions(versions: {
  fileVersion: string | null;
  databaseVersion: string | null;
  dateOfCreation: string | null;
}): void {
  if (!versions.dateOfCreation || versions.dateOfCreation === "INVALID") {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: official header date_of_creation missing",
    );
  }
  if (versions.dateOfCreation !== EXPECTED_KANJIDIC2_RELEASE) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: date_of_creation ${versions.dateOfCreation}, expected ${EXPECTED_KANJIDIC2_RELEASE}`,
    );
  }
  if (versions.fileVersion !== EXPECTED_KANJIDIC2_FILE_VERSION) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE VERSION MISMATCH: file_version ${versions.fileVersion}, expected ${EXPECTED_KANJIDIC2_FILE_VERSION}`,
    );
  }
  if (versions.databaseVersion !== EXPECTED_KANJIDIC2_DATABASE_VERSION) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE VERSION MISMATCH: database_version ${versions.databaseVersion}, expected ${EXPECTED_KANJIDIC2_DATABASE_VERSION}`,
    );
  }
}

/**
 * Preamble bound for the version header. The pinned file places the complete
 * `<header>` element (after the inline DTD) before the first `<character>`,
 * past the first 8192 bytes and well before this limit. The scan stops at the
 * first character record or at this limit, whichever comes first, and never
 * retains the corpus.
 */
export const KANJIDIC2_PREAMBLE_SCAN_LIMIT = 1024 * 1024;

const ROOT_NEEDLE = Buffer.from("<kanjidic2>");
const XML_NEEDLE = Buffer.from("<?xml");
const CHARACTER_OPEN = Buffer.from("<character>");
const CHARACTER_CLOSE = Buffer.from("</character>");
const LITERAL_OPEN = Buffer.from("<literal>");

export interface OfficialKanjidic2Scan {
  fileVersion: string | null;
  databaseVersion: string | null;
  dateOfCreation: string | null;
  sawRoot: boolean;
  sawXmlDeclaration: boolean;
  characterOpen: number;
  characterClose: number;
  literalCount: number;
  preambleBytes: number;
  preambleClosed: boolean;
}

class NeedleCounter {
  count = 0;
  private carry = Buffer.alloc(0);
  constructor(private readonly needle: Buffer) {}
  feed(chunk: Buffer): void {
    const window = this.carry.length === 0 ? chunk : Buffer.concat([this.carry, chunk]);
    let from = 0;
    while (from <= window.length - this.needle.length) {
      const found = window.indexOf(this.needle, from);
      if (found < 0) break;
      this.count++;
      from = found + this.needle.length;
    }
    const keep = this.needle.length - 1;
    this.carry = Buffer.from(window.subarray(Math.max(0, window.length - keep)));
  }
}

function extractTagValue(
  text: string,
  tag: string,
): { value: string | null; sawClose: boolean } {
  const match = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  if (match) return { value: match[1], sawClose: true };
  return { value: null, sawClose: text.includes(`</${tag}>`) };
}

/**
 * Streaming scan of retained source bytes. Constant memory on the corpus;
 * only the bounded preamble region is retained. Counts `<character>` /
 * `</character>` / `<literal>` and extracts the official header versions.
 */
export class Kanjidic2ByteScan implements OfficialKanjidic2Scan {
  fileVersion: string | null = null;
  databaseVersion: string | null = null;
  dateOfCreation: string | null = null;
  sawRoot = false;
  sawXmlDeclaration = false;
  characterOpen = 0;
  characterClose = 0;
  literalCount = 0;
  preambleBytes = 0;
  preambleClosed = false;
  private preamble = Buffer.alloc(0);
  private readonly opens = new NeedleCounter(CHARACTER_OPEN);
  private readonly closes = new NeedleCounter(CHARACTER_CLOSE);
  private readonly literals = new NeedleCounter(LITERAL_OPEN);

  feed(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.opens.feed(chunk);
    this.closes.feed(chunk);
    this.literals.feed(chunk);
    this.characterOpen = this.opens.count;
    this.characterClose = this.closes.count;
    this.literalCount = this.literals.count;
    if (this.preambleClosed) return;
    const room = KANJIDIC2_PREAMBLE_SCAN_LIMIT - this.preamble.length;
    if (room > 0) {
      this.preamble = Buffer.concat([this.preamble, chunk.subarray(0, room)]);
      this.sawXmlDeclaration = this.preamble.subarray(0, 256).includes(XML_NEEDLE);
      const text = this.preamble.toString("utf8");
      if (text.includes(ROOT_NEEDLE.toString("utf8"))) this.sawRoot = true;
      if (this.fileVersion === null) {
        const tag = extractTagValue(text, "file_version");
        this.fileVersion = tag.value ?? (tag.sawClose ? "INVALID" : null);
      }
      if (this.databaseVersion === null) {
        const tag = extractTagValue(text, "database_version");
        this.databaseVersion = tag.value ?? (tag.sawClose ? "INVALID" : null);
      }
      if (this.dateOfCreation === null) {
        const tag = extractTagValue(text, "date_of_creation");
        this.dateOfCreation = tag.value ?? (tag.sawClose ? "INVALID" : null);
      }
    }
    this.preambleBytes += chunk.length;
    // Version extraction is complete once the first character record begins
    // (the pinned file places the whole header before it), or at the bound.
    if (this.characterOpen > 0 || this.preambleBytes >= KANJIDIC2_PREAMBLE_SCAN_LIMIT) {
      this.preambleClosed = true;
    }
  }
}

export function assertOfficialKanjidic2Scan(scan: OfficialKanjidic2Scan): void {
  if (!scan.sawXmlDeclaration || !scan.sawRoot) {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — MALFORMED SOURCE: KANJIDIC2 XML declaration or root element is missing",
    );
  }
  // This performs the version check before the balanced-record and expected
  // count checks. It is intentionally the final validation before exposure.
  assertOfficialKanjidic2Versions(scan);
  if (
    scan.characterOpen !== scan.characterClose ||
    scan.characterOpen !== scan.literalCount
  ) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — MALFORMED SOURCE: character tags are not balanced (${scan.characterOpen}/${scan.characterClose}/${scan.literalCount})`,
    );
  }
  assertOfficialKanjidicEntryCount(scan.characterOpen);
}

export function assertOfficialKanjidicEntryCount(
  actual: number,
  expected = EXPECTED_KANJIDIC2_ENTRIES,
): void {
  if (!Number.isSafeInteger(actual) || actual !== expected) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE COUNT MISMATCH: expected ${expected}, got ${actual}`,
    );
  }
}

export function assertOfficialKanjidicByteSize(
  actual: number,
  expected = EXPECTED_KANJIDIC2_BYTES,
): void {
  if (!Number.isSafeInteger(actual) || actual !== expected) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE SIZE MISMATCH: expected ${expected}, got ${actual}`,
    );
  }
}
