/**
 * Pinned JMdict 2023-08 contract for Phase 14.3D.
 *
 * This is the only release the full-ingestion path may verify. JMdict 2024-07
 * remains in the provenance registry for older callers and must not be
 * substituted here.
 */

export const JMDICT_SOURCE_ID = "upstream:jmdict:2023-08";
export const REJECTED_JMDICT_SOURCE_ID = "upstream:jmdict:2024-07";
export const EXPECTED_JMDICT_RELEASE = "2023-08-20";
export const EXPECTED_JMDICT_ENTRIES = 206717;
export const EXPECTED_JMDICT_BYTES = 115331197;
export const EXPECTED_JMDICT_SHA256 =
  "a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162";
export const EXPECTED_JMDICT_ARCHIVE_SHA256 =
  "608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16";
export const EXPECTED_JMDICT_ARCHIVE_BYTES = 13383352;

export function assertPinnedJmdictSource(sourceId: string): void {
  if (sourceId === REJECTED_JMDICT_SOURCE_ID) {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — refusing JMdict 2024-07. The pinned release is upstream:jmdict:2023-08.",
    );
  }
  if (sourceId !== JMDICT_SOURCE_ID) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — refusing unpinned source "${sourceId}". Expected ${JMDICT_SOURCE_ID}.`,
    );
  }
}

/** Official XML header check. Does not read a file and does not claim the artifact is present. */
export function assertOfficialJmdictHeader(header: string): void {
  const created = header.match(/JMdict created:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  if (!created) {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: official header date missing",
    );
  }
  if (created[1].startsWith("2024-07")) {
    throw new Error(
      "[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: refusing JMdict 2024-07. The pinned release is upstream:jmdict:2023-08.",
    );
  }
  if (created[1] !== EXPECTED_JMDICT_RELEASE) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: header ${created[1]}, expected ${EXPECTED_JMDICT_RELEASE}`,
    );
  }
}

/**
 * Preamble bound for the release comment. The pinned file places
 * `JMdict created:` after the DTD, past the first 8192 bytes and before
 * `<JMdict>`. This is not an 8192-byte window. The scan stops at the root
 * element or at this limit, whichever comes first, and never retains the corpus.
 */
export const JMDICT_PREAMBLE_SCAN_LIMIT = 1024 * 1024;

const CREATED_NEEDLE = Buffer.from("JMdict created:");
const ROOT_NEEDLE = Buffer.from("<JMdict>");
const XML_NEEDLE = Buffer.from("<?xml");
const ENTRY_OPEN = Buffer.from("<entry>");
const ENTRY_CLOSE = Buffer.from("</entry>");
const ENT_SEQ = Buffer.from("<ent_seq>");

export interface OfficialSourceScan {
  releaseDate: string | null;
  sawRoot: boolean;
  sawXmlDeclaration: boolean;
  entryOpen: number;
  entryClose: number;
  entSeq: number;
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

/** Streaming scan of retained source bytes. Constant memory; not limited to 8192 bytes. */
export class JmdictByteScan implements OfficialSourceScan {
  releaseDate: string | null = null;
  sawRoot = false;
  sawXmlDeclaration = false;
  entryOpen = 0;
  entryClose = 0;
  entSeq = 0;
  preambleBytes = 0;
  preambleClosed = false;
  private preambleCarry = Buffer.alloc(0);
  private start = Buffer.alloc(0);
  private readonly entries = new NeedleCounter(ENTRY_OPEN);
  private readonly closes = new NeedleCounter(ENTRY_CLOSE);
  private readonly sequences = new NeedleCounter(ENT_SEQ);

  feed(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.entries.feed(chunk);
    this.closes.feed(chunk);
    this.sequences.feed(chunk);
    this.entryOpen = this.entries.count;
    this.entryClose = this.closes.count;
    this.entSeq = this.sequences.count;
    if (this.preambleClosed) return;
    if (this.start.length < 64) {
      this.start = Buffer.concat([this.start, chunk]).subarray(0, 64);
      this.sawXmlDeclaration = this.start.includes(XML_NEEDLE);
    }
    const window = this.preambleCarry.length === 0 ? chunk : Buffer.concat([this.preambleCarry, chunk]);
    if (!this.releaseDate) {
      const at = window.indexOf(CREATED_NEEDLE);
      if (at >= 0) {
        const tail = window.subarray(at, Math.min(window.length, at + 48)).toString("utf8");
        const created = tail.match(/JMdict created:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (created) this.releaseDate = created[1];
        else if (window.length - at >= 32) this.releaseDate = "INVALID";
      }
    }
    if (window.includes(ROOT_NEEDLE)) this.sawRoot = true;
    this.preambleBytes += chunk.length;
    this.preambleCarry = Buffer.from(window.subarray(Math.max(0, window.length - 48)));
    if (this.sawRoot || this.preambleBytes >= JMDICT_PREAMBLE_SCAN_LIMIT) this.preambleClosed = true;
  }
}

export function assertOfficialSourceScan(scan: OfficialSourceScan): void {
  if (!scan.sawXmlDeclaration || !scan.sawRoot) {
    throw new Error("[SOURCE_VERIFIED] STOP — MALFORMED SOURCE: JMdict XML declaration or root element is missing");
  }
  if (!scan.releaseDate || scan.releaseDate === "INVALID") {
    throw new Error("[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: official header date missing");
  }
  assertOfficialJmdictHeader(`JMdict created: ${scan.releaseDate}`);
  if (scan.entryOpen !== scan.entryClose || scan.entryOpen !== scan.entSeq) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — MALFORMED SOURCE: entry tags are not balanced (${scan.entryOpen}/${scan.entryClose}/${scan.entSeq})`,
    );
  }
  assertOfficialEntryCount(scan.entryOpen);
}

export function assertOfficialEntryCount(actual: number, expected = EXPECTED_JMDICT_ENTRIES): void {
  if (!Number.isSafeInteger(actual) || actual !== expected) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE COUNT MISMATCH: expected ${expected}, got ${actual}`,
    );
  }
}

export function assertOfficialByteSize(actual: number, expected = EXPECTED_JMDICT_BYTES): void {
  if (!Number.isSafeInteger(actual) || actual !== expected) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE SIZE MISMATCH: expected ${expected}, got ${actual}`,
    );
  }
}
