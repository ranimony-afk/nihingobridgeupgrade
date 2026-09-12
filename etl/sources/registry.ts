/**
 * NihongoBridge ETL — Formal Source Registry
 *
 * P19: Every data source gets a complete registration covering:
 *   source, license, version, download location, checksum,
 *   adapter, parser, transformer, status.
 *
 * This is the SINGLE SOURCE OF TRUTH for "what data can we import,
 * where does it come from, and what code handles it?"
 *
 * Adding a new source:
 *   1. Add a SourceRegistration entry below
 *   2. Implement the parser in etl/parsers/
 *   3. Implement the transformer in etl/transforms/
 *   4. Create or reuse an adapter in etl/adapters/
 *   5. Wire into a pipeline in etl/pipelines/
 *   6. Set status to "ready"
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Pipeline integration status for a source. */
export type SourceStatus =
  | "ready"        // Parser + transformer + adapter implemented; can run
  | "draft"        // Pipeline scaffolded but parser not yet complete
  | "planned"      // Registered but no implementation yet
  | "disabled"     // Temporarily disabled (data issue, license question, etc.)
  | "deprecated";  // Replaced by another source; kept for provenance history

/** Complete registration for a data source. */
export interface SourceRegistration {
  // ── Identity ──
  /** Unique machine key (used in DB provenance columns). */
  id: string;
  /** Human-readable source name. */
  name: string;
  /** Brief description of what this source provides. */
  description: string;

  // ── License & Attribution ──
  /** SPDX identifier or short license name. */
  license: string;
  /** Full URL to the license text. */
  licenseUrl: string;
  /** Attribution text to display in the application. */
  attribution: string;

  // ── Version ──
  /** Version of the source data file (date or semantic version). */
  version: string;
  /** How often the upstream source is updated. */
  updateFrequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "irregular" | "static";

  // ── Download ──
  /** Primary download URL. */
  downloadUrl: string;
  /** Filename to save locally (inside etl/data/raw/). */
  filename: string;
  /** File format of the downloaded archive. */
  format: "xml.gz" | "xml" | "tsv.bz2" | "tsv" | "csv" | "jsonl" | "json" | "zip" | "other";
  /** Expected SHA-256 of the downloaded file. null = not pinned (re-download allowed). */
  expectedSha256: string | null;
  /** Mirror/fallback download URL, if available. */
  mirrorUrl: string | null;
  /** Approximate download size in bytes (for progress display). */
  approximateBytes: number | null;

  // ── Pipeline Components ──
  /** Which adapter loads records into the DB. */
  adapter: {
    /** Module path relative to etl/ (e.g. "adapters/upsert"). */
    module: string;
    /** Function or class name exported from the module. */
    entry: string;
  };
  /** Which parser reads the raw file format. */
  parser: {
    module: string;
    entry: string;
    /** What raw format the parser emits (matches types.ts interface). */
    emits: string;
  };
  /** Which transformer converts raw → canonical schema. */
  transformer: {
    module: string;
    entry: string;
    /** What canonical type the transformer produces. */
    produces: string;
  };

  // ── Target Tables ──
  /** Primary target table in the DB schema. */
  targetTable: string;
  /** Additional child tables written during import. */
  childTables: string[];

  // ── Pipeline ──
  /** Pipeline module that orchestrates this source's import. */
  pipelineModule: string;
  /** Approximate record count for progress estimation. */
  estimatedRecords: number | null;

  // ── Status ──
  status: SourceStatus;
  /** When this source was last successfully imported. null = never. */
  lastImportedAt: Date | null;
  /** Notes on current status (why disabled, what's blocking, etc.). */
  statusNote: string | null;
}

// ─────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────

export const SOURCE_REGISTRY: Record<string, SourceRegistration> = {

  // ───────── DICTIONARY ─────────

  jmdict: {
    id: "jmdict",
    name: "JMdict",
    description:
      "Japanese-Multilingual Dictionary. The primary source for vocabulary entries, " +
      "readings, senses, glosses, parts of speech, and usage tags. ~210,000 entries.",

    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "This application uses the JMdict/EDICT dictionary file. " +
      "These files are the property of the Electronic Dictionary Research " +
      "and Development Group (EDRDG), and are used in conformance with " +
      "the Group's licence. See https://www.edrdg.org/",

    version: "2024-07-01",
    updateFrequency: "monthly",

    downloadUrl: "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz",
    filename: "JMdict_e.xml.gz",
    format: "xml.gz",
    expectedSha256: null,
    mirrorUrl: "https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
    approximateBytes: 25_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "pipelines/jmdict",
      entry: "JMdictPipeline.parse",
      emits: "JMdictEntryRaw",
    },
    transformer: {
      module: "pipelines/jmdict",
      entry: "JMdictPipeline.transform",
      produces: "DictionaryEntryCanonical",
    },

    targetTable: "dictionary_entries",
    childTables: ["dictionary_senses", "dictionary_readings"],

    pipelineModule: "pipelines/jmdict",
    estimatedRecords: 210_000,

    status: "draft",
    lastImportedAt: null,
    statusNote: "Pipeline architecture wired. XML SAX parser pending implementation.",
  },

  jmnedict: {
    id: "jmnedict",
    name: "JMnedict",
    description:
      "Japanese proper names dictionary. Contains ~750,000 name entries " +
      "(people, places, organisations, etc.).",

    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "Japanese proper names from the JMnedict dictionary file " +
      "by EDRDG. See https://www.edrdg.org/",

    version: "2024-07-01",
    updateFrequency: "monthly",

    downloadUrl: "https://www.edrdg.org/pub/Nihongo/JMnedict.xml.gz",
    filename: "JMnedict.xml.gz",
    format: "xml.gz",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 12_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "parsers/jmnedict",
      entry: "JMnedictParser",
      emits: "JMnedictEntryRaw",
    },
    transformer: {
      module: "transforms/jmnedict",
      entry: "JMnedictTransformer",
      produces: "DictionaryEntryCanonical",
    },

    targetTable: "dictionary_entries",
    childTables: ["dictionary_senses", "dictionary_readings"],

    pipelineModule: "pipelines/jmnedict",
    estimatedRecords: 750_000,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Lower priority than JMdict. Parser not yet implemented.",
  },

  // ───────── KANJI ─────────

  kanjidic2: {
    id: "kanjidic2",
    name: "KANJIDIC2",
    description:
      "Comprehensive kanji dictionary in XML format. Contains ~13,000 kanji " +
      "with readings, meanings, stroke counts, grades, JLPT levels, and more.",

    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "Kanji data from the KANJIDIC2 project by EDRDG. " +
      "See https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",

    version: "2024-07-01",
    updateFrequency: "quarterly",

    downloadUrl: "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    filename: "kanjidic2.xml.gz",
    format: "xml.gz",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 5_500_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "parsers/kanjidic2",
      entry: "Kanjidic2Parser",
      emits: "KanjidicEntryRaw",
    },
    transformer: {
      module: "transforms/kanjidic2",
      entry: "Kanjidic2Transformer",
      produces: "KanjiEntryCanonical",
    },

    targetTable: "kanji_entries",
    childTables: ["kanji_readings"],

    pipelineModule: "pipelines/kanjidic2",
    estimatedRecords: 13_108,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Parser not yet implemented. High priority for Phase 3.",
  },

  radkfile: {
    id: "radkfile",
    name: "RADKFILE/KRADFILE",
    description:
      "Radical decomposition data. Maps kanji to their component radicals " +
      "and radicals to the kanji that contain them. ~214 radicals, ~6,355 kanji mapped.",

    license: "EDRDG",
    licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
    attribution:
      "Radical-kanji mapping data from RADKFILE/KRADFILE " +
      "by Jim Breen / EDRDG.",

    version: "2024-01-01",
    updateFrequency: "yearly",

    downloadUrl: "https://www.edrdg.org/krad/kradfile.gz",
    filename: "kradfile.gz",
    format: "other",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 100_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchInsert",
    },
    parser: {
      module: "parsers/radkfile",
      entry: "RadkfileParser",
      emits: "RadkfileEntryRaw",
    },
    transformer: {
      module: "transforms/radkfile",
      entry: "RadkfileTransformer",
      produces: "KanjiComponentCanonical",
    },

    targetTable: "kanji_components",
    childTables: ["kanji_component_links"],

    pipelineModule: "pipelines/radkfile",
    estimatedRecords: 6_355,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Depends on kanjidic2 import (kanji_entries must exist first).",
  },

  // ───────── SENTENCES ─────────

  tatoeba_jpn: {
    id: "tatoeba_jpn",
    name: "Tatoeba (Japanese sentences)",
    description:
      "Japanese example sentences from the Tatoeba corpus. " +
      "Provides natural-language examples with community translations in ~100 languages.",

    license: "CC-BY-2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    attribution:
      "Example sentences from Tatoeba (https://tatoeba.org), " +
      "licensed under Creative Commons Attribution 2.0. " +
      "Individual sentences are attributed to their authors.",

    version: "2024-07-01",
    updateFrequency: "weekly",

    downloadUrl: "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2",
    filename: "jpn_sentences_detailed.tsv.bz2",
    format: "tsv.bz2",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 8_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "parsers/tatoeba",
      entry: "TatoebaParser",
      emits: "TatoebaSentenceRaw",
    },
    transformer: {
      module: "transforms/tatoeba",
      entry: "TatoebaTransformer",
      produces: "SentenceCanonical",
    },

    targetTable: "sentences",
    childTables: ["sentence_translations"],

    pipelineModule: "pipelines/tatoeba",
    estimatedRecords: 230_000,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Parser not yet implemented. Depends on sentence translation links file.",
  },

  tatoeba_links: {
    id: "tatoeba_links",
    name: "Tatoeba (translation links)",
    description:
      "Translation link pairs between Tatoeba sentences. " +
      "Maps Japanese sentence IDs to their English (and other language) translations.",

    license: "CC-BY-2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    attribution: "Translation links from Tatoeba (https://tatoeba.org).",

    version: "2024-07-01",
    updateFrequency: "weekly",

    downloadUrl: "https://downloads.tatoeba.org/exports/links.tar.bz2",
    filename: "links.tar.bz2",
    format: "tsv.bz2",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 50_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchInsert",
    },
    parser: {
      module: "parsers/tatoeba",
      entry: "TatoebaLinksParser",
      emits: "TatoebaLinkRaw",
    },
    transformer: {
      module: "transforms/tatoeba",
      entry: "TatoebaLinksTransformer",
      produces: "SentenceTranslationCanonical",
    },

    targetTable: "sentence_translations",
    childTables: [],

    pipelineModule: "pipelines/tatoeba",
    estimatedRecords: 2_000_000,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Processed as part of the tatoeba_jpn pipeline.",
  },

  // ───────── ENRICHMENT ─────────

  jlpt_vocab: {
    id: "jlpt_vocab",
    name: "JLPT Vocabulary Lists",
    description:
      "Vocabulary word lists grouped by JLPT level (N5–N1). " +
      "Used to tag dictionary entries with their JLPT level. ~10,000 words total.",

    license: "Public domain / community-compiled",
    licenseUrl: "",
    attribution:
      "JLPT vocabulary level classifications from community-compiled open lists.",

    version: "2024-01-01",
    updateFrequency: "static",

    downloadUrl: "",
    filename: "",
    format: "other",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: null,

    adapter: {
      module: "enrichment/jlpt",
      entry: "enrichDictionaryJlpt",
    },
    parser: {
      module: "parsers/jlpt-lists",
      entry: "JlptListParser",
      emits: "JlptWordEntry",
    },
    transformer: {
      module: "enrichment/jlpt",
      entry: "enrichDictionaryJlpt",
      produces: "(updates dictionary_entries.jlpt_level in-place)",
    },

    targetTable: "dictionary_entries",
    childTables: [],

    pipelineModule: "pipelines/enrichment",
    estimatedRecords: 10_000,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Enrichment source — updates existing rows, does not insert new ones.",
  },

  jlpt_kanji: {
    id: "jlpt_kanji",
    name: "JLPT Kanji Lists",
    description:
      "Kanji character lists grouped by JLPT level (N5–N1). " +
      "Used to tag kanji entries. ~2,136 kanji total (jōyō set).",

    license: "Public domain / community-compiled",
    licenseUrl: "",
    attribution:
      "JLPT kanji level classifications from community-compiled open lists.",

    version: "2024-01-01",
    updateFrequency: "static",

    downloadUrl: "",
    filename: "",
    format: "other",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: null,

    adapter: {
      module: "enrichment/jlpt",
      entry: "enrichKanjiJlpt",
    },
    parser: {
      module: "parsers/jlpt-lists",
      entry: "JlptKanjiParser",
      emits: "JlptKanjiEntry",
    },
    transformer: {
      module: "enrichment/jlpt",
      entry: "enrichKanjiJlpt",
      produces: "(updates kanji_entries.jlpt_level in-place)",
    },

    targetTable: "kanji_entries",
    childTables: [],

    pipelineModule: "pipelines/enrichment",
    estimatedRecords: 2_136,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Enrichment source — updates existing rows.",
  },

  frequency_corpus: {
    id: "frequency_corpus",
    name: "Word Frequency Corpus",
    description:
      "Word frequency rankings from a Japanese text corpus. " +
      "Used to populate dictionary_entries.frequency_rank.",

    license: "Public domain",
    licenseUrl: "",
    attribution: "Word frequency data from the Innocent Corpus.",

    version: "2024-01-01",
    updateFrequency: "static",

    downloadUrl: "",
    filename: "",
    format: "other",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: null,

    adapter: {
      module: "enrichment/frequency",
      entry: "enrichFrequency",
    },
    parser: {
      module: "parsers/frequency",
      entry: "FrequencyParser",
      emits: "FrequencyEntry",
    },
    transformer: {
      module: "enrichment/frequency",
      entry: "enrichFrequency",
      produces: "(updates dictionary_entries.frequency_rank in-place)",
    },

    targetTable: "dictionary_entries",
    childTables: [],

    pipelineModule: "pipelines/enrichment",
    estimatedRecords: 50_000,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Enrichment source — requires frequency data file.",
  },

  // ───────── GRAMMAR ─────────

  grammar_manual: {
    id: "grammar_manual",
    name: "Grammar Points (Manual / Curated)",
    description:
      "Hand-curated grammar pattern definitions with structures, " +
      "explanations, and examples. Covers N5–N1 grammar. ~800 patterns.",

    license: "Proprietary (NihongoBridge)",
    licenseUrl: "",
    attribution: "Grammar explanations by NihongoBridge editorial team.",

    version: "1.0.0",
    updateFrequency: "irregular",

    downloadUrl: "",
    filename: "",
    format: "jsonl",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: null,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "parsers/grammar-jsonl",
      entry: "GrammarJsonlParser",
      emits: "GrammarPatternRaw",
    },
    transformer: {
      module: "transforms/grammar",
      entry: "GrammarTransformer",
      produces: "GrammarPatternCanonical",
    },

    targetTable: "grammar_patterns",
    childTables: ["grammar_examples"],

    pipelineModule: "pipelines/grammar",
    estimatedRecords: 800,

    status: "planned",
    lastImportedAt: null,
    statusNote: "Requires curated grammar JSONL file from editorial team.",
  },

  // ───────── ADDITIONAL SOURCES (P23) ─────────
  // Each source below has been verified for license compatibility.
  // Sources with unclear or restrictive licenses are NOT included.

  kanjivg: {
    id: "kanjivg",
    name: "KanjiVG",
    description:
      "Kanji stroke order data in SVG format by Ulrich Apel. " +
      "Provides vector paths for every stroke of ~11,000 kanji and kana, " +
      "enabling stroke-order animation and writing practice features.",

    license: "CC-BY-SA-3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    attribution:
      "Kanji stroke order data from the KanjiVG project by Ulrich Apel. " +
      "Licensed under Creative Commons Attribution-Share Alike 3.0. " +
      "See https://kanjivg.tagaini.net/",

    version: "2024-03-01",
    updateFrequency: "irregular",

    downloadUrl: "https://github.com/KanjiVG/kanjivg/releases/latest/download/kanjivg-20240301.xml.gz",
    filename: "kanjivg.xml.gz",
    format: "xml.gz",
    expectedSha256: null,
    mirrorUrl: "https://github.com/KanjiVG/kanjivg/archive/refs/heads/master.zip",
    approximateBytes: 6_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "parsers/kanjivg",
      entry: "KanjiVGParser",
      emits: "KanjiVGEntryRaw",
    },
    transformer: {
      module: "transforms/kanjivg",
      entry: "KanjiVGTransformer",
      produces: "KanjiStrokeCanonical",
    },

    targetTable: "kanji_entries",
    childTables: [],

    pipelineModule: "pipelines/kanjivg",
    estimatedRecords: 11_000,

    status: "planned",
    lastImportedAt: null,
    statusNote:
      "LICENSE VERIFIED: CC-BY-SA-3.0. Compatible with platform's CC-BY-SA-4.0 content. " +
      "Enriches existing kanji_entries with stroke path data. " +
      "Depends on kanjidic2 import (kanji_entries must exist first).",
  },

  tatoeba_eng: {
    id: "tatoeba_eng",
    name: "Tatoeba (English sentences)",
    description:
      "English sentences from the Tatoeba corpus. " +
      "Combined with tatoeba_links, provides English translations " +
      "for Japanese example sentences.",

    license: "CC-BY-2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    attribution:
      "English translations from Tatoeba (https://tatoeba.org). " +
      "Licensed under Creative Commons Attribution 2.0.",

    version: "2024-07-01",
    updateFrequency: "weekly",

    downloadUrl: "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2",
    filename: "eng_sentences_detailed.tsv.bz2",
    format: "tsv.bz2",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 60_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchInsert",
    },
    parser: {
      module: "parsers/tatoeba",
      entry: "TatoebaParser",
      emits: "TatoebaSentenceRaw",
    },
    transformer: {
      module: "transforms/tatoeba",
      entry: "TatoebaEngTransformer",
      produces: "SentenceTranslationCanonical",
    },

    targetTable: "sentence_translations",
    childTables: [],

    pipelineModule: "pipelines/tatoeba",
    estimatedRecords: 1_500_000,

    status: "planned",
    lastImportedAt: null,
    statusNote:
      "LICENSE VERIFIED: CC-BY-2.0. Same license as tatoeba_jpn. " +
      "Processed as part of the Tatoeba pipeline alongside tatoeba_jpn and tatoeba_links.",
  },

  tatoeba_tags: {
    id: "tatoeba_tags",
    name: "Tatoeba (sentence tags)",
    description:
      "User-applied tags on Tatoeba sentences. " +
      "Includes JLPT level tags that can be used to classify sentence difficulty.",

    license: "CC-BY-2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    attribution: "Sentence tags from Tatoeba (https://tatoeba.org).",

    version: "2024-07-01",
    updateFrequency: "weekly",

    downloadUrl: "https://downloads.tatoeba.org/exports/tags.csv",
    filename: "tatoeba_tags.csv",
    format: "csv",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 5_000_000,

    adapter: {
      module: "enrichment/jlpt",
      entry: "enrichSentenceJlpt",
    },
    parser: {
      module: "parsers/tatoeba",
      entry: "TatoebaTagsParser",
      emits: "TatoebaTagRaw",
    },
    transformer: {
      module: "enrichment/tatoeba-tags",
      entry: "TatoebaTagsEnricher",
      produces: "(updates sentences.jlpt_level in-place)",
    },

    targetTable: "sentences",
    childTables: [],

    pipelineModule: "pipelines/tatoeba",
    estimatedRecords: 500_000,

    status: "planned",
    lastImportedAt: null,
    statusNote:
      "LICENSE VERIFIED: CC-BY-2.0. Enrichment source — " +
      "tags sentences with JLPT level based on community-applied tags. " +
      "Depends on tatoeba_jpn import.",
  },

  kradfile: {
    id: "kradfile",
    name: "KRADFILE",
    description:
      "Kanji-to-radical decomposition file. Maps each kanji to its constituent radicals. " +
      "Complementary to RADKFILE (which maps radicals to kanji). ~6,355 kanji entries.",

    license: "EDRDG",
    licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
    attribution:
      "Kanji-radical decomposition data from KRADFILE by Jim Breen / EDRDG.",

    version: "2024-01-01",
    updateFrequency: "yearly",

    downloadUrl: "https://www.edrdg.org/krad/kradfile.gz",
    filename: "kradfile.gz",
    format: "other",
    expectedSha256: null,
    mirrorUrl: null,
    approximateBytes: 80_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchInsert",
    },
    parser: {
      module: "parsers/kradfile",
      entry: "KradfileParser",
      emits: "KradfileEntryRaw",
    },
    transformer: {
      module: "transforms/kradfile",
      entry: "KradfileTransformer",
      produces: "KanjiComponentLinkCanonical",
    },

    targetTable: "kanji_component_links",
    childTables: [],

    pipelineModule: "pipelines/radkfile",
    estimatedRecords: 6_355,

    status: "planned",
    lastImportedAt: null,
    statusNote:
      "LICENSE VERIFIED: EDRDG license (free for non-commercial and educational use, " +
      "attribution required). Complements RADKFILE — both are processed in the same pipeline. " +
      "Depends on kanjidic2 and radkfile imports.",
  },

  jmdict_multilingual: {
    id: "jmdict_multilingual",
    name: "JMdict (Full multilingual)",
    description:
      "Full JMdict file including glosses in French, German, Russian, Spanish, " +
      "Hungarian, Dutch, Slovenian, and Swedish, in addition to English. " +
      "~210,000 entries with multilingual translations.",

    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "Multilingual dictionary data from the JMdict project by EDRDG. " +
      "Non-English glosses contributed by various language communities. " +
      "See https://www.edrdg.org/",

    version: "2024-07-01",
    updateFrequency: "monthly",

    downloadUrl: "https://www.edrdg.org/pub/Nihongo/JMdict.gz",
    filename: "JMdict_full.xml.gz",
    format: "xml.gz",
    expectedSha256: null,
    mirrorUrl: "https://ftp.edrdg.org/pub/Nihongo/JMdict.gz",
    approximateBytes: 50_000_000,

    adapter: {
      module: "adapters/upsert",
      entry: "batchUpsert",
    },
    parser: {
      module: "pipelines/jmdict",
      entry: "JMdictPipeline.parse",
      emits: "JMdictEntryRaw",
    },
    transformer: {
      module: "pipelines/jmdict",
      entry: "JMdictPipeline.transform",
      produces: "DictionaryEntryCanonical",
    },

    targetTable: "dictionary_entries",
    childTables: ["dictionary_senses", "dictionary_readings"],

    pipelineModule: "pipelines/jmdict",
    estimatedRecords: 210_000,

    status: "planned",
    lastImportedAt: null,
    statusNote:
      "LICENSE VERIFIED: CC-BY-SA-4.0 (same as JMdict English-only). " +
      "Uses the same parser as jmdict but processes non-English glosses into " +
      "dictionary_senses.glosses JSONB (keyed by lang code). " +
      "Can replace jmdict source once multilingual support is needed.",
  },

  // ───────── REJECTED SOURCES (documented for audit trail) ─────────
  //
  // The following sources were evaluated and NOT added due to licensing concerns:
  //
  // ❌ ENAMDICT — EDRDG license, but contains personal names with privacy
  //    considerations. JMnedict is the preferred replacement with clearer terms.
  //
  // ❌ Wadoku (Japanese-German) — Last public export is from 2015 (stale).
  //    The wadoku.eu API exists but has no bulk-download license for offline use.
  //
  // ❌ CEDICT (Chinese-English) — Out of scope for a Japanese learning platform.
  //
  // ❌ Proprietary pitch accent databases — Various pitch accent datasets exist
  //    (e.g., NHK accent dictionary data) but are copyrighted and cannot be
  //    redistributed. If pitch accent is needed, it must come from a CC-licensed
  //    source or be generated computationally.
  //
  // ❌ Wiktionary dumps — CC-BY-SA-3.0 licensed, but the structured data
  //    extraction is unreliable and requires heavy parsing. JMdict is a
  //    cleaner source for the same information.
  //
  // ❌ Google Translate API — Not a data source (it's a service). Cannot be
  //    cached or redistributed. Translation data must come from Tatoeba or
  //    human translators.
  //
};

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

/** Get a source by ID. Throws if not found. */
export function getSource(id: string): SourceRegistration {
  const source = SOURCE_REGISTRY[id];
  if (!source) {
    throw new Error(
      `Unknown source "${id}". Known sources: ${Object.keys(SOURCE_REGISTRY).join(", ")}`,
    );
  }
  return source;
}

/** Get all sources with a given status. */
export function getSourcesByStatus(status: SourceStatus): SourceRegistration[] {
  return Object.values(SOURCE_REGISTRY).filter((s) => s.status === status);
}

/** Get all sources that target a given table. */
export function getSourcesForTable(tableName: string): SourceRegistration[] {
  return Object.values(SOURCE_REGISTRY).filter(
    (s) => s.targetTable === tableName || s.childTables.includes(tableName),
  );
}

/** Print a human-readable summary of the registry. */
export function printRegistrySummary(): void {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  NihongoBridge ETL — Source Registry                                ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");

  const statusIcon: Record<SourceStatus, string> = {
    ready: "✅",
    draft: "🔧",
    planned: "📋",
    disabled: "⛔",
    deprecated: "📦",
  };

  for (const [, s] of Object.entries(SOURCE_REGISTRY)) {
    const icon = statusIcon[s.status];
    const records = s.estimatedRecords
      ? `~${(s.estimatedRecords / 1000).toFixed(0)}K`
      : "?";
    console.log(
      `║  ${icon} ${s.id.padEnd(20)} ${s.status.padEnd(10)} ${records.padStart(6)} → ${s.targetTable.padEnd(22)} ║`,
    );
  }

  const byStatus = {
    ready: getSourcesByStatus("ready").length,
    draft: getSourcesByStatus("draft").length,
    planned: getSourcesByStatus("planned").length,
    disabled: getSourcesByStatus("disabled").length,
    deprecated: getSourcesByStatus("deprecated").length,
  };

  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(
    `║  Total: ${Object.keys(SOURCE_REGISTRY).length} sources ` +
      `(${byStatus.ready} ready, ${byStatus.draft} draft, ${byStatus.planned} planned)`.padEnd(67) +
      "║",
  );
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
}
