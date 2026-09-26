/**
 * Source-contract verifier. The pinned release comment is past byte 8192.
 * These tests do not open a database or write a resume checkpoint.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXPECTED_JMDICT_BYTES,
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_RELEASE,
  EXPECTED_JMDICT_SHA256,
  JMDICT_PREAMBLE_SCAN_LIMIT,
  JMDICT_SOURCE_ID,
  JmdictByteScan,
  assertOfficialByteSize,
  assertOfficialEntryCount,
  assertOfficialSourceScan,
  assertPinnedJmdictSource,
} from "@/etl/dictionary/jmdictContract";
import { releaseVerifiedSource, verifySourceContract } from "../scripts/ingest-full-jmdict";

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}
function shaFile(path: string): string {
  const hash = createHash("sha256");
  const fd = fs.openSync(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}
const kept: string[] = [];
afterEach(() => {
  for (const path of kept.splice(0)) fs.rmSync(path, { force: true });
});

function lateReleaseFile(date: string, entries = 1): Buffer {
  const pad = Buffer.alloc(9000, 0x20);
  const body = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n${pad.toString("utf8")}\n<!-- JMdict created: ${date} -->\n<JMdict>\n` +
    Array.from({ length: entries }, (_, i) => `<entry><ent_seq>${i + 1}</ent_seq></entry>`).join("\n") +
    "\n</JMdict>\n",
  );
  return body;
}

function feed(scan: JmdictByteScan, bytes: Buffer, chunkSize = 64) {
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    scan.feed(bytes.subarray(offset, offset + chunkSize));
  }
}

describe("JMdict source-contract scan", () => {
  it("accepts a release comment after byte 8192 and does not use that window as the bound", () => {
    expect(JMDICT_PREAMBLE_SCAN_LIMIT).toBeGreaterThan(8192);
    const bytes = lateReleaseFile("2023-08-20");
    expect(bytes.subarray(0, 8192).toString("utf8")).not.toContain("JMdict created:");
    const scan = new JmdictByteScan();
    feed(scan, bytes, 100);
    expect(scan.releaseDate).toBe("2023-08-20");
    expect(scan.sawRoot).toBe(true);
    expect(scan.entryOpen).toBe(1);
    expect(() => assertOfficialSourceScan(scan)).toThrow(/SOURCE COUNT MISMATCH/);
    const split = new JmdictByteScan();
    feed(split, Buffer.from("<?xml version=\"1.0\"?><!-- JMdict created: 2023-08-20 --><JMdict><entry><ent_seq>1</ent_seq></entry></JMdict>"), 3);
    expect(split.releaseDate).toBe("2023-08-20");
    expect(split.entryOpen).toBe(split.entryClose);
    expect(split.entSeq).toBe(1);
  });

  it("rejects a missing marker, a wrong release, 2024-07, and malformed bytes", () => {
    const missing = new JmdictByteScan();
    feed(missing, Buffer.from("<?xml version=\"1.0\"?><JMdict></JMdict>"));
    expect(() => assertOfficialSourceScan(missing)).toThrow(/official header date missing/);

    const wrong = new JmdictByteScan();
    feed(wrong, lateReleaseFile("1999-01-01"));
    expect(() => assertOfficialSourceScan(wrong)).toThrow(/SOURCE RELEASE MISMATCH/);

    const rejected = new JmdictByteScan();
    feed(rejected, lateReleaseFile("2024-07-01"));
    expect(() => assertOfficialSourceScan(rejected)).toThrow(/2024-07/);

    const malformed = new JmdictByteScan();
    feed(malformed, Buffer.from("this is not xml"));
    expect(() => assertOfficialSourceScan(malformed)).toThrow(/MALFORMED SOURCE/);
    expect(() => assertPinnedJmdictSource("upstream:jmdict:2024-07")).toThrow(/2024-07/);
  });

  it("rejects the wrong size and the wrong hash before any database or checkpoint write", () => {
    const checkpoint = join(process.cwd(), "data/test-checkpoint.json");
    const before = fs.readFileSync(checkpoint);
    const path = join(tmpdir(), `jmdict-short-${process.pid}.xml`);
    kept.push(path);
    fs.writeFileSync(path, lateReleaseFile("2023-08-20"));
    expect(() => assertOfficialByteSize(fs.statSync(path).size)).toThrow(/SOURCE SIZE MISMATCH/);
    expect(() => verifySourceContract(path)).toThrow(/SOURCE SIZE MISMATCH/);
    expect(() => verifySourceContract(path, "0".repeat(64))).toThrow(/SOURCE HASH MISMATCH/);
    expect(() => verifySourceContract(path, sha(fs.readFileSync(path)), "1999-01-01")).toThrow(/SOURCE RELEASE MISMATCH/);
    expect(fs.readFileSync(checkpoint)).toEqual(before);
    expect(process.env.DATABASE_URL ?? "").toBe("");
  });

  it.skipIf(!fs.existsSync(join(process.cwd(), "data/JMdict.xml")))(
    "verifies the retained pinned file from its own bytes, including a release comment past 8192",
    () => {
    const xmlPath = join(process.cwd(), "data/JMdict.xml");
    const checkpoint = join(process.cwd(), "data/test-checkpoint.json");
    const before = fs.readFileSync(checkpoint);
    const fd = fs.openSync(xmlPath, "r");
    const head = Buffer.alloc(8192);
    fs.readSync(fd, head, 0, 8192, 0);
    fs.closeSync(fd);
    expect(head.toString("utf8")).not.toContain("JMdict created:");
    expect(fs.statSync(xmlPath).size).toBe(EXPECTED_JMDICT_BYTES);

    const source = verifySourceContract(xmlPath);
    try {
      expect(source.sourceId).toBe(JMDICT_SOURCE_ID);
      expect(source.releaseVersion).toBe(EXPECTED_JMDICT_RELEASE);
      expect(source.xmlSizeBytes).toBe(EXPECTED_JMDICT_BYTES);
      expect(source.xmlSha256).toBe(EXPECTED_JMDICT_SHA256);
      expect(source.expectedEntries).toBe(EXPECTED_JMDICT_ENTRIES);
      expect(source.xmlSha256).toBe(shaFile(xmlPath));
    } finally {
      releaseVerifiedSource(source);
    }
    expect(fs.readFileSync(checkpoint)).toEqual(before);
    },
  );
});
