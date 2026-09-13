#!/usr/bin/env node
/**
 * NihongoBridge knowledge ETL — kanji / radicals / components / vocabulary.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node etl/run-pipeline.mjs
 *   node etl/run-pipeline.mjs --only kanji
 *   node etl/run-pipeline.mjs --only structure
 *   node etl/run-pipeline.mjs --only vocabulary --max-priority 2
 *
 * The pipeline is additive: it never issues DROP/TRUNCATE statements.
 */
import "dotenv/config";

import { parseJmdict } from "./parsers/jmdict.mjs";
import { parseKanjidic2 } from "./parsers/kanjidic2.mjs";
import { parseKradfile, parseRadkfile } from "./parsers/kradfile.mjs";
import {
  connect,
  fetchIdMap,
  finishRun,
  insertBatch,
  startRun,
  upsertSources,
} from "./loaders/postgres.mjs";
import { ensureSources } from "./sources/registry.mjs";

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const onlyArg = argValue("--only", "kanji,structure,vocabulary");
const stages = new Set(onlyArg.split(",").map((stage) => stage.trim()));
const maxPriority = Number(argValue("--max-priority", "2"));

const log = (message) => console.log(`[etl] ${new Date().toISOString()} ${message}`);

async function main() {
  log(`downloading / verifying sources (stages: ${[...stages].join(", ")})`);
  const sources = ensureSources([
    "kanjidic2",
    ...(stages.has("structure") ? ["radkfile", "kradfile"] : []),
    ...(stages.has("vocabulary") ? ["jmdict"] : []),
  ]);
  const sourceFile = (code) => sources.find((source) => source.code === code);

  const client = await connect();
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    const runId = await startRun(client, "knowledge-kanji-graph", {
      stages: [...stages],
      maxPriority,
    });

    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, sources);

    /* ------------------------------- kanji -------------------------------- */
    let kanjiByLiteral = new Map();

    if (stages.has("kanji")) {
      const file = sourceFile("kanjidic2");
      const sourceId = sourceIds.get("kanjidic2");
      const rows = [];
      for await (const entry of parseKanjidic2(file.path)) {
        kanjiByLiteral.set(entry.literal, entry);
        rows.push({
          literal: entry.literal,
          codepoint: entry.codepoint,
          stroke_count: entry.strokeCount,
          grade: entry.grade,
          frequency: entry.frequency,
          jlpt_level: entry.jlptLevel,
          jlpt_legacy_level: entry.jlptLegacyLevel,
          radical_number: entry.classicalRadical,
          heisig_index: entry.heisigIndex,
          skip_code: entry.skipCode,
          source_id: sourceId,
        });
        recordsRead += 1;
      }
      log(`kanjidic2: parsed ${rows.length} characters`);

      recordsWritten += await insertBatch(
        client,
        "kanji",
        [
          "literal",
          "codepoint",
          "stroke_count",
          "grade",
          "frequency",
          "jlpt_level",
          "jlpt_legacy_level",
          "radical_number",
          "heisig_index",
          "skip_code",
          "source_id",
        ],
        rows,
        {
          conflict: "literal",
          update: `codepoint = EXCLUDED.codepoint,
                   stroke_count = EXCLUDED.stroke_count,
                   grade = EXCLUDED.grade,
                   frequency = EXCLUDED.frequency,
                   jlpt_level = EXCLUDED.jlpt_level,
                   jlpt_legacy_level = EXCLUDED.jlpt_legacy_level,
                   radical_number = EXCLUDED.radical_number,
                   heisig_index = EXCLUDED.heisig_index,
                   skip_code = EXCLUDED.skip_code,
                   source_id = EXCLUDED.source_id`,
        },
      );

      const kanjiIds = await fetchIdMap(client, "kanji", "literal");
      const meaningRows = [];
      const readingRows = [];
      for (const entry of kanjiByLiteral.values()) {
        const kanjiId = kanjiIds.get(entry.literal);
        if (!kanjiId) continue;
        entry.meanings.slice(0, 12).forEach((meaning, index) => {
          meaningRows.push({ kanji_id: kanjiId, meaning, lang: "en", position: index });
        });
        for (const type of ["ja_on", "ja_kun", "nanori"]) {
          entry.readings[type].forEach((reading, index) => {
            readingRows.push({ kanji_id: kanjiId, reading, reading_type: type, position: index });
          });
        }
      }
      recordsWritten += await insertBatch(
        client,
        "kanji_meanings",
        ["kanji_id", "meaning", "lang", "position"],
        meaningRows,
        { conflict: "kanji_id, lang, position", update: "meaning = EXCLUDED.meaning" },
      );
      recordsWritten += await insertBatch(
        client,
        "kanji_readings",
        ["kanji_id", "reading", "reading_type", "position"],
        readingRows,
        { conflict: "kanji_id, reading_type, position", update: "reading = EXCLUDED.reading" },
      );
      log(
        `kanjidic2: stored ${meaningRows.length} meanings and ${readingRows.length} readings`,
      );
    }

    const kanjiIds = await fetchIdMap(client, "kanji", "literal");

    /* ---------------------- structure: radicals --------------------------- */
    if (stages.has("structure")) {
      if (kanjiByLiteral.size === 0) {
        kanjiByLiteral = await loadKanjiContext(client);
      }

      const radkGroups = parseRadkfile(sourceFile("radkfile").path, "euc-jp");
      const radkSourceId = sourceIds.get("radkfile");
      const kradRows = parseKradfile(sourceFile("kradfile").path, "euc-jp");
      const kradSourceId = sourceIds.get("kradfile");
      log(`radkfile: ${radkGroups.length} radical groups, kradfile: ${kradRows.length} kanji`);

      /* Kangxi radical numbers are not part of RADKFILE, so they are derived
         purely from the data: every RADKFILE group is matched against the set
         of kanji that KANJIDIC2 assigns to a classical radical number. The
         group with the highest coverage becomes the canonical Kangxi radical
         for that number, the remaining ones are recorded as variants. */
      const kanjiByClassical = new Map();
      for (const [literal, entry] of kanjiByLiteral) {
        if (!entry.classicalRadical) continue;
        const bucket = kanjiByClassical.get(entry.classicalRadical) ?? new Set();
        bucket.add(literal);
        kanjiByClassical.set(entry.classicalRadical, bucket);
      }

      for (const group of radkGroups) {
        const members = new Set(group.kanji);
        let bestNumber = null;
        let bestOverlap = 0;
        let fallbackNumber = null;
        let fallbackCoverage = 0;

        for (const [number, kanjiSet] of kanjiByClassical) {
          let overlap = 0;
          for (const literal of members) if (kanjiSet.has(literal)) overlap += 1;
          if (overlap === 0) continue;
          const coverage = overlap / Math.max(kanjiSet.size, 1);
          // Prefer full coverage of a radical class; among those, the group
          // that explains the most kanji wins (this keeps 一 for #1, not 亅).
          if (coverage >= 0.5 && overlap > bestOverlap) {
            bestOverlap = overlap;
            bestNumber = number;
          }
          if (coverage > fallbackCoverage) {
            fallbackCoverage = coverage;
            fallbackNumber = number;
          }
        }

        const chosen = bestNumber ?? fallbackNumber;
        group.radicalNumberFor = chosen ?? null;
        group.coverage = chosen === bestNumber ? 1 : fallbackCoverage;
        group.overlap = chosen
          ? [...members].filter((literal) => kanjiByClassical.get(chosen)?.has(literal)).length
          : 0;
      }

      const canonicalByNumber = new Map();
      for (const group of radkGroups) {
        if (group.radicalNumberFor === null) continue;
        const current = canonicalByNumber.get(group.radicalNumberFor);
        if (!current || group.overlap > current.overlap) {
          canonicalByNumber.set(group.radicalNumberFor, group);
        }
      }
      for (const group of radkGroups) {
        group.isKangxiCanonical = canonicalByNumber.get(group.radicalNumberFor) === group;
      }

      const radicalRows = [];
      for (const group of radkGroups) {
        const canonical = canonicalByNumber.get(group.radicalNumberFor) === group;
        const kanjiEntry = kanjiByLiteral.get(group.literal);
        radicalRows.push({
          literal: group.literal,
          stroke_count: group.strokeCount ?? kanjiEntry?.strokeCount ?? null,
          radical_number: group.radicalNumberFor,
          is_kangxi: canonical,
          meanings: kanjiEntry ? JSON.stringify(kanjiEntry.meanings.slice(0, 4)) : null,
          source_id: radkSourceId,
        });
      }

      recordsWritten += await insertBatch(
        client,
        "radicals",
        ["literal", "stroke_count", "radical_number", "is_kangxi", "meanings", "source_id"],
        radicalRows,
        {
          conflict: "literal",
          update: `stroke_count = EXCLUDED.stroke_count,
                   radical_number = EXCLUDED.radical_number,
                   is_kangxi = EXCLUDED.is_kangxi,
                   meanings = EXCLUDED.meanings,
                   source_id = EXCLUDED.source_id`,
        },
      );

      const radicalIds = await fetchIdMap(client, "radicals", "literal");
      for (const group of radkGroups) {
        group.radicalId = radicalIds.get(group.literal) ?? null;
        group.memberSet = new Set(group.kanji);
      }

      /* kanji_radicals: classical (Kangxi) + radkfile multi-radical groups */
      const radicalLinkRows = [];
      const seenRadicalLinks = new Set();

      const pushRadicalLink = (kanjiId, radicalId, isPrimary, relation) => {
        if (!kanjiId || !radicalId) return;
        const key = `${kanjiId}:${radicalId}:${relation}`;
        if (seenRadicalLinks.has(key)) return;
        seenRadicalLinks.add(key);
        radicalLinkRows.push({
          kanji_id: kanjiId,
          radical_id: radicalId,
          is_primary: isPrimary,
          relation,
          source_id: relation === "classical" ? sourceIds.get("kanjidic2") : radkSourceId,
        });
      };

      // Attach the Kangxi radical number computed above to each group.
      const radicalNumberByGroupLiteral = new Map(
        radicalRows.map((row) => [row.literal, row.radical_number]),
      );
      const groupsByRadicalNumber = new Map();
      for (const group of radkGroups) {
        const number = radicalNumberByGroupLiteral.get(group.literal);
        group.radicalNumberFor = number ?? null;
        if (number === null) continue;
        const bucket = groupsByRadicalNumber.get(number) ?? [];
        bucket.push(group);
        groupsByRadicalNumber.set(number, bucket);
      }

      for (const [literal, entry] of kanjiByLiteral) {
        const kanjiId = kanjiIds.get(literal);
        if (!kanjiId || !entry.classicalRadical) continue;
        const candidates = groupsByRadicalNumber.get(entry.classicalRadical) ?? [];
        const match =
          candidates.find((group) => group.isKangxiCanonical && group.memberSet.has(literal)) ??
          candidates.find((group) => group.memberSet.has(literal)) ??
          candidates.find((group) => group.isKangxiCanonical) ??
          candidates[0] ??
          null;
        if (match) pushRadicalLink(kanjiId, match.radicalId, true, "classical");
      }

      for (const group of radkGroups) {
        if (!group.radicalId) continue;
        for (const literal of group.kanji) {
          pushRadicalLink(kanjiIds.get(literal), group.radicalId, false, "radkfile");
        }
      }

      recordsWritten += await insertBatch(
        client,
        "kanji_radicals",
        ["kanji_id", "radical_id", "is_primary", "relation", "source_id"],
        radicalLinkRows,
        {
          conflict: "kanji_id, radical_id, relation",
          update: "is_primary = EXCLUDED.is_primary, source_id = EXCLUDED.source_id",
        },
      );
      log(`radkfile: ${radicalLinkRows.length} kanji<->radical links`);

      /* --------------------- structure: components ------------------------ */
      const componentLiterals = new Set();
      for (const row of kradRows) {
        for (const component of row.components) componentLiterals.add(component);
      }
      for (const group of radkGroups) componentLiterals.add(group.literal);

      const componentRows = [...componentLiterals].map((literal) => ({
        literal,
        stroke_count: kanjiByLiteral.get(literal)?.strokeCount ?? null,
        kind: kanjiIds.has(literal) ? "kanji" : "radical_variant",
        kanji_id: kanjiIds.get(literal) ?? null,
        radical_id: radicalIds.get(literal) ?? null,
        source_id: kradSourceId,
      }));

      recordsWritten += await insertBatch(
        client,
        "components",
        ["literal", "stroke_count", "kind", "kanji_id", "radical_id", "source_id"],
        componentRows,
        {
          conflict: "literal",
          update: `kind = EXCLUDED.kind,
                   kanji_id = EXCLUDED.kanji_id,
                   radical_id = EXCLUDED.radical_id,
                   stroke_count = EXCLUDED.stroke_count,
                   source_id = EXCLUDED.source_id`,
        },
      );

      const componentIds = await fetchIdMap(client, "components", "literal");
      const componentLinkRows = [];
      const seenComponentLinks = new Set();
      for (const row of kradRows) {
        const kanjiId = kanjiIds.get(row.literal);
        if (!kanjiId) continue;
        row.components.forEach((componentLiteral, index) => {
          const componentId = componentIds.get(componentLiteral);
          if (!componentId) return;
          const key = `${kanjiId}:${componentId}`;
          if (seenComponentLinks.has(key)) return;
          seenComponentLinks.add(key);
          componentLinkRows.push({
            kanji_id: kanjiId,
            component_id: componentId,
            position: index,
            source_id: kradSourceId,
          });
        });
      }
      recordsWritten += await insertBatch(
        client,
        "kanji_components",
        ["kanji_id", "component_id", "position", "source_id"],
        componentLinkRows,
        { conflict: "kanji_id, component_id", update: "position = EXCLUDED.position" },
      );
      log(`kradfile: ${componentRows.length} components, ${componentLinkRows.length} links`);
    }

    /* --------------------------- vocabulary -------------------------------- */
    if (stages.has("vocabulary")) {
      const file = sourceFile("jmdict");
      const sourceId = sourceIds.get("jmdict");
      const rows = [];
      for await (const entry of parseJmdict(file.path, { maxPriority })) {
        rows.push({
          external_id: entry.externalId,
          kanji_text: entry.kanjiText,
          kana_text: entry.kanaText,
          meanings: JSON.stringify(entry.meanings),
          parts_of_speech: JSON.stringify(entry.partsOfSpeech),
          priority: entry.priority,
          language: "en",
          source_id: sourceId,
        });
        recordsRead += 1;
      }
      log(`jmdict: ${rows.length} entries with priority <= ${maxPriority}`);

      recordsWritten += await insertBatch(
        client,
        "vocabulary",
        [
          "external_id",
          "kanji_text",
          "kana_text",
          "meanings",
          "parts_of_speech",
          "priority",
          "language",
          "source_id",
        ],
        rows,
        {
          conflict: "external_id",
          update: `kanji_text = EXCLUDED.kanji_text,
                   kana_text = EXCLUDED.kana_text,
                   meanings = EXCLUDED.meanings,
                   parts_of_speech = EXCLUDED.parts_of_speech,
                   priority = EXCLUDED.priority,
                   source_id = EXCLUDED.source_id`,
        },
      );

      const vocabularyIds = await fetchIdMap(client, "vocabulary", "external_id");
      const linkRows = [];
      const seenLinks = new Set();
      for (const row of rows) {
        const vocabularyId = vocabularyIds.get(row.external_id);
        if (!vocabularyId) continue;
        const chars = [...row.kanji_text];
        chars.forEach((char, index) => {
          const kanjiId = kanjiIds.get(char);
          if (!kanjiId) return;
          const key = `${kanjiId}:${vocabularyId}`;
          if (seenLinks.has(key)) return;
          seenLinks.add(key);
          linkRows.push({
            kanji_id: kanjiId,
            vocabulary_id: vocabularyId,
            position: index,
            vocabulary_priority: row.priority,
          });
        });
      }
      recordsWritten += await insertBatch(
        client,
        "kanji_vocabulary",
        ["kanji_id", "vocabulary_id", "position", "vocabulary_priority"],
        linkRows,
        { conflict: "kanji_id, vocabulary_id", update: "position = EXCLUDED.position" },
      );
      log(`jmdict: ${linkRows.length} kanji<->vocabulary links`);
    }

    /* --------------------------- maintenance ------------------------------- */
    await client.query(`
      UPDATE components c
         SET usage_count = sub.total
        FROM (SELECT component_id, count(*)::int AS total FROM kanji_components GROUP BY component_id) sub
       WHERE c.id = sub.component_id
    `);

    await client.query("COMMIT");
    await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(`done: ${recordsRead} records read, ${recordsWritten} rows written`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    log(`FAILED: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

/** Rebuilds the in-memory kanji context when only the structure stage runs. */
async function loadKanjiContext(client) {
  const kanjiResult = await client.query(
    `SELECT id, literal, stroke_count, radical_number FROM kanji`,
  );
  const meaningResult = await client.query(
    `SELECT kanji_id, meaning FROM kanji_meanings WHERE lang = 'en' ORDER BY kanji_id, position`,
  );
  const meanings = new Map();
  for (const row of meaningResult.rows) {
    const bucket = meanings.get(row.kanji_id) ?? [];
    bucket.push(row.meaning);
    meanings.set(row.kanji_id, bucket);
  }
  const map = new Map();
  for (const row of kanjiResult.rows) {
    map.set(row.literal, {
      literal: row.literal,
      strokeCount: row.stroke_count,
      classicalRadical: row.radical_number,
      meanings: meanings.get(row.id) ?? [],
    });
  }
  return map;
}

main();
