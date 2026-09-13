/**
 * Phase 04.5 enrichment tests.
 * Run: npx tsx --test etl/tests/enrichment.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveConjugations } from "../enrichment/conjugation";
import { parseKradLine } from "../parsers/kradfile-parser";
import { deriveFurigana, toHiragana } from "../enrichment/furigana";
import { validateManifest } from "../enrichment/supplemental-validation";
import { assessNativeSource, assessSupplementalSource, type ProvenanceRun } from "../provenance/reliability";

const nativeRun: ProvenanceRun = {
  id: 1,
  source: "jmdict",
  sourceUrl: "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz",
  license: "CC BY-SA 4.0",
  attribution: "EDRDG",
  checksumSha256: "a".repeat(64),
  checksumVerified: true,
  isFixture: false,
  status: "success",
};

/* ----------------------------- KRADFILE input ---------------------------- */

test("KRADFILE parser retains a component relationship and ignores comments", () => {
  assert.deepEqual(parseKradLine("語 : 言 五 口"), {
    literal: "語",
    components: ["言", "五", "口"],
  });
  assert.equal(parseKradLine("# comment"), null);
  assert.equal(parseKradLine("no separator"), null);
  // Input-level dedupe preserves a stable first-seen component sequence.
  assert.deepEqual(parseKradLine("日 : 日 日"), { literal: "日", components: ["日"] });
});

/* -------------------------------- furigana ------------------------------ */

test("toHiragana normalizes katakana for safe comparisons", () => {
  assert.equal(toHiragana("ミズ"), "みず");
  assert.equal(toHiragana("水ミズ"), "水みず");
});

test("furigana derives one unambiguous kanji run", () => {
  const result = deriveFurigana("食べる", ["たべる"]);
  assert.deepEqual(result, {
    ok: true,
    reason: "unambiguous",
    segments: [
      { text: "食", reading: "た", ruby: true },
      { text: "べる", reading: "べる", ruby: false },
    ],
  });
});

test("furigana retains a grouped contiguous kanji run safely", () => {
  const result = deriveFurigana("学校", ["がっこう"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.segments, [{ text: "学校", reading: "がっこう", ruby: true }]);
  }
});

test("furigana confirms kana-only entries without pretending they are ruby", () => {
  const result = deriveFurigana("ありがとう", ["アリガトウ"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.reason, "kana-only");
    assert.deepEqual(result.segments, [
      { text: "ありがとう", reading: "アリガトウ", ruby: false },
    ]);
  }
});

test("furigana rejects source ambiguity rather than guessing", () => {
  const multiReading = deriveFurigana("生", ["せい", "しょう"]);
  assert.equal(multiReading.ok, false);
  if (!multiReading.ok) assert.match(multiReading.reason, /exactly one reading/);

  const multiRun = deriveFurigana("お茶を飲む", ["おちゃをのむ"]);
  assert.equal(multiRun.ok, false);
  if (!multiRun.ok) assert.match(multiRun.reason, /separate kanji runs/);

  const mismatch = deriveFurigana("食べる", ["くう"]);
  assert.equal(mismatch.ok, false);
});

/* ------------------------------ conjugation ----------------------------- */

test("conjugation derives all four ichidan forms", () => {
  const result = deriveConjugations("食べる", "たべる", ["v1"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.class, "ichidan");
    assert.deepEqual(result.forms, [
      { form: "negative", text: "食べない", reading: "たべない" },
      { form: "polite", text: "食べます", reading: "たべます" },
      { form: "past", text: "食べた", reading: "たべた" },
      { form: "te", text: "食べて", reading: "たべて" },
    ]);
  }
});

test("conjugation handles regular godan and the 行く exception", () => {
  const nomu = deriveConjugations("飲む", "のむ", ["v5m"]);
  assert.equal(nomu.ok, true);
  if (nomu.ok) {
    assert.deepEqual(nomu.forms, [
      { form: "negative", text: "飲まない", reading: "のまない" },
      { form: "polite", text: "飲みます", reading: "のみます" },
      { form: "past", text: "飲んだ", reading: "のんだ" },
      { form: "te", text: "飲んで", reading: "のんで" },
    ]);
  }

  const iku = deriveConjugations("行く", "いく", ["v5k-s"]);
  assert.equal(iku.ok, true);
  if (iku.ok) {
    assert.equal(iku.forms[2].text, "行った");
    assert.equal(iku.forms[3].text, "行って");
  }
});

test("conjugation supports suru verbs and rejects ambiguous/unsupported forms", () => {
  const suru = deriveConjugations("勉強する", "べんきょうする", ["vs"]);
  assert.equal(suru.ok, true);
  if (suru.ok) assert.equal(suru.forms[1].text, "勉強します");

  assert.equal(deriveConjugations("来る", "くる", ["vk"]).ok, false);
  assert.equal(deriveConjugations("生きる", "いきる", ["v1", "v5r"]).ok, false);
  assert.equal(deriveConjugations("見る", "みる", ["n"]).ok, false);
});

/* -------------------------- provenance admission ------------------------ */

test("reliability policy accepts a verified native EDRDG run", () => {
  const decision = assessNativeSource(nativeRun, "jmdict");
  assert.deepEqual(decision, {
    trusted: true,
    mode: "production",
    reason: "verified EDRDG source run",
  });
});

test("reliability policy rejects unchecked, wrong-host, wrong-license and fixtures", () => {
  assert.equal(
    assessNativeSource({ ...nativeRun, checksumVerified: false }, "jmdict").trusted,
    false,
  );
  assert.equal(
    assessNativeSource({ ...nativeRun, sourceUrl: "https://example.com/jm.xml" }, "jmdict").trusted,
    false,
  );
  assert.equal(
    assessNativeSource({ ...nativeRun, license: "proprietary" }, "jmdict").trusted,
    false,
  );
  assert.equal(
    assessNativeSource({ ...nativeRun, isFixture: true }, "jmdict").trusted,
    false,
  );
  assert.equal(
    assessNativeSource({ ...nativeRun, isFixture: true }, "jmdict", { allowFixture: true })
      .trusted,
    true,
  );
});

test("supplemental policy has no default approval for JLPT or pitch", () => {
  const jlptRun: ProvenanceRun = { ...nativeRun, source: "jlpt", sourceUrl: "https://lists.example/jlpt" };
  assert.equal(assessSupplementalSource(jlptRun, "jlpt", []).trusted, false);
  assert.equal(
    assessSupplementalSource(jlptRun, "jlpt", ["https://lists.example/jlpt"]).trusted,
    true,
  );
  assert.equal(
    assessSupplementalSource({ ...jlptRun, isFixture: true }, "jlpt", [], { allowFixture: true })
      .trusted,
    true,
  );
  assert.equal(
    assessSupplementalSource(
      { ...jlptRun, isFixture: true, checksumVerified: false },
      "jlpt",
      [],
      { allowFixture: true },
    ).trusted,
    false,
    "fixture supplemental feeds still require a verified checksum",
  );
});

/* ---------------------------- feed validation --------------------------- */

test("supplemental manifests require complete provenance metadata", () => {
  const valid = {
    source: "pitch" as const,
    sourceUrl: "https://approved.example/pitch.json",
    sourceVersion: "2026-01",
    license: "CC BY 4.0",
    attribution: "Example Source",
    checksumSha256: "b".repeat(64),
    checksumVerified: true,
    isFixture: false,
  };
  assert.equal(validateManifest(valid), null);
  assert.match(
    validateManifest({ ...valid, checksumSha256: "bad" }) ?? "",
    /64-char SHA-256/,
  );
  assert.match(validateManifest({ ...valid, attribution: "" }) ?? "", /attribution/);
  assert.match(validateManifest({ ...valid, sourceUrl: "bad-url" }) ?? "", /URL/);
});
