/**
 * Authoritative Source Registry — Phase 14.1.
 *
 * Defines the controlled registry of upstream datasets, first-party content,
 * and review-required candidates.
 *
 * HARD RULE: Every source must carry verified licensing and attribution.
 * Sources with uncertain legal status are marked status='requires_review'
 * and license='UNKNOWN' to prevent accidental ingestion.
 */

import type {
  ProvenanceContract,
  SourceDomain,
  SourceStatus,
  SourceType,
} from "./types";

export const AUTHORITATIVE_SOURCE_REGISTRY: Record<string, ProvenanceContract> = {
  // -------------------------------------------------------------
  // UPSTREAM AUTHORITATIVE SOURCES
  // -------------------------------------------------------------
  "upstream:jmdict:2024-07": {
    id: "upstream:jmdict:2024-07",
    type: "upstream",
    name: "JMdict Japanese-Multilingual Dictionary",
    version: "2024-07",
    releaseDate: "2024-07-01",
    uri: "https://www.edrdg.org/jmdict/j_jmdict.html",
    license: "CC-BY-SA-3.0",
    attribution:
      "Electronic Dictionary Research and Development Group (EDRDG)",
    description:
      "Comprehensive Japanese-English dictionary with part-of-speech, readings, frequency markings, and glosses.",
    domain: "dictionary",
    status: "active",
    targetTables: ["dictionary_entries"],
  },

  "upstream:jmdict:2023-08": {
    id: "upstream:jmdict:2023-08",
    type: "upstream",
    name: "JMdict Japanese-Multilingual Dictionary",
    version: "2023-08",
    releaseDate: "2023-08-20",
    uri: "https://www.edrdg.org/jmdict/j_jmdict.html",
    license: "CC-BY-SA-3.0",
    attribution:
      "Electronic Dictionary Research and Development Group (EDRDG)",
    description:
      "Comprehensive Japanese multilingual dictionary with part-of-speech, readings, frequency markings, and glosses.",
    domain: "dictionary",
    status: "active",
    contentHash: "a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162",
    artifactBytes: 115331197,
    archiveSha256: "608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16",
    targetTables: ["dictionary_entries"],
  },

  "upstream:kanjidic2:2023-08": {
    id: "upstream:kanjidic2:2023-08",
    type: "upstream",
    name: "KANJIDIC2 Kanji Dictionary",
    version: "2023-08",
    releaseDate: "2023-08-20",
    uri: "https://www.edrdg.org/wiki/index.php/KANJIDIC2",
    license: "CC-BY-SA-3.0",
    attribution:
      "Electronic Dictionary Research and Development Group (EDRDG)",
    description:
      "Comprehensive kanji dictionary file covering Joyo, Jinmeiyo, readings, meanings, stroke counts, and radical indices.",
    domain: "kanji",
    status: "active",
    targetTables: ["kanji_entries", "kanji_radicals"],
  },

  "upstream:kanjidic2:2024-07": {
    id: "upstream:kanjidic2:2024-07",
    type: "upstream",
    name: "KANJIDIC2 Kanji Dictionary",
    version: "2024-07",
    releaseDate: "2024-07-01",
    uri: "https://www.edrdg.org/wiki/index.php/KANJIDIC2",
    license: "CC-BY-SA-3.0",
    attribution:
      "Electronic Dictionary Research and Development Group (EDRDG)",
    description:
      "Comprehensive kanji dictionary file covering Joyo, Jinmeiyo, readings, meanings, stroke counts, and radical indices.",
    domain: "kanji",
    status: "active",
    targetTables: ["kanji_entries", "kanji_radicals"],
  },

  "upstream:kanjivg:2024-04": {
    id: "upstream:kanjivg:2024-04",
    type: "upstream",
    name: "KanjiVG Stroke & Component Decomposition",
    version: "2024-04",
    releaseDate: "2024-04-18",
    uri: "https://kanjivg.tagaini.net/",
    license: "CC-BY-SA-3.0",
    attribution:
      "Ulrich Apel and the KanjiVG project (CC BY-SA 3.0)",
    description:
      "Vector decomposition of kanji into strokes, classical radicals, and structural primitive components.",
    domain: "kanji",
    status: "active",
    targetTables: ["kanji_composition", "kanji_radicals"],
  },

  "upstream:kanjivg:2024-08": {
    id: "upstream:kanjivg:2024-08",
    type: "upstream",
    name: "KanjiVG Stroke & Component Decomposition",
    version: "2024-08",
    releaseDate: "2024-08-07",
    uri: "https://github.com/KanjiVG/kanjivg/releases/tag/r20240807",
    license: "CC-BY-SA-3.0",
    attribution:
      "Ulrich Apel and the KanjiVG project (CC BY-SA 3.0)",
    description:
      "Vector decomposition of kanji into strokes, classical radicals, and structural primitive components.",
    domain: "kanji",
    status: "active",
    targetTables: ["kanji_composition", "kanji_radicals"],
  },

  "upstream:tatoeba:2024-07": {
    id: "upstream:tatoeba:2024-07",
    type: "upstream",
    name: "Tatoeba Multilingual Example Sentences",
    version: "2024-07",
    releaseDate: "2024-07-01",
    uri: "https://tatoeba.org",
    license: "CC-BY-2.0-FR",
    attribution:
      "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR",
    description:
      "Open collaborative collection of natural Japanese example sentences with aligned English translations.",
    domain: "sentence",
    status: "active",
    targetTables: ["example_sentences"],
  },

  // -------------------------------------------------------------
  // FIRST-PARTY NIHONGOBRIDGE DATASETS
  // -------------------------------------------------------------
  "first-party:kana:v1": {
    id: "first-party:kana:v1",
    type: "first_party",
    name: "NihongoBridge Kana Reference Standard",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Standard Japanese phonological kana reference dataset (Gojuon, Dakuten, Handakuten, Yoon).",
    domain: "mixed",
    status: "active",
    targetTables: ["kana_entries"],
  },

  "first-party:kanji-mindtree:v1": {
    id: "first-party:kanji-mindtree:v1",
    type: "first_party",
    name: "NihongoBridge Kanji Mind Tree",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Original kanji decomposition data: meanings, readings, stroke counts, components, mnemonics, and relational edges.",
    domain: "kanji",
    status: "active",
    targetTables: ["kanji_entries", "kanji_radicals", "kanji_composition"],
  },

  "first-party:dictionary-core:v1": {
    id: "first-party:dictionary-core:v1",
    type: "first_party",
    name: "NihongoBridge Core Dictionary",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Original English glosses for common Japanese headwords with kana and romaji readings.",
    domain: "dictionary",
    status: "active",
    targetTables: ["dictionary_entries"],
  },

  "first-party:grammar-core:v1": {
    id: "first-party:grammar-core:v1",
    type: "first_party",
    name: "NihongoBridge Core Grammar",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Original explanations of core JLPT N5–N1 grammar patterns, structures, and common learner mistakes.",
    domain: "grammar",
    status: "active",
    targetTables: ["grammar_patterns"],
  },

  "first-party:sentences-core:v1": {
    id: "first-party:sentences-core:v1",
    type: "first_party",
    name: "NihongoBridge Example Sentences",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Original pedagogical example sentences with kana readings, English translations, and entity links.",
    domain: "sentence",
    status: "active",
    targetTables: ["example_sentences"],
  },

  "first-party:jlpt-mock:v1": {
    id: "first-party:jlpt-mock:v1",
    type: "first_party",
    name: "NihongoBridge JLPT Mock Assessment Question Bank",
    version: "v1",
    releaseDate: "2026-01-01",
    uri: null,
    license: "First-party content, all rights reserved by NihongoBridge",
    attribution: "Authored in-repository for NihongoBridge",
    description:
      "Authentic JLPT examination practice questions, scoring rubrics, and mock exam test configurations.",
    domain: "mixed",
    status: "active",
    targetTables: ["questions", "jlpt_tests", "jlpt_test_questions"],
  },

  // -------------------------------------------------------------
  // EDITORIAL / CMS OVERLAY PROVENANCE
  // -------------------------------------------------------------
  "editorial:cms-review:v1": {
    id: "editorial:cms-review:v1",
    type: "editorial",
    name: "NihongoBridge CMS Editorial Overlay",
    version: "v1",
    releaseDate: "2026-02-01",
    uri: null,
    license: "Editorial work product, NihongoBridge",
    attribution: "NihongoBridge Editorial Review Team",
    description:
      "Human-curated editorial overrides, translation validations, and peer-reviewed corrections.",
    domain: "mixed",
    status: "active",
    targetTables: ["editorial_overlay"],
  },

  // -------------------------------------------------------------
  // CANDIDATE / REVIEW-REQUIRED DEMONSTRATION RECORD
  // -------------------------------------------------------------
  "candidate:unverified-glosses:2024": {
    id: "candidate:unverified-glosses:2024",
    type: "enrichment",
    name: "Unverified Third-Party Wordlist",
    version: "2024",
    releaseDate: null,
    uri: "https://example.com/unverified-wordlist",
    license: "UNKNOWN",
    attribution: "Unknown / Unverified",
    description:
      "Candidate vocabulary enrichment dataset with unverified redistribution rights. Ingestion strictly forbidden.",
    domain: "dictionary",
    status: "requires_review",
    targetTables: ["dictionary_entries"],
  },
};

/**
 * Historical / existing aliases mapping to canonical registry records.
 * Ensures backward compatibility with existing codebase references.
 */
export const SOURCE_ALIASES: Record<string, string> = {
  "jmdict:edrdg:2024-07": "upstream:jmdict:2024-07",
  "jmdict:edrdg:2023-08": "upstream:jmdict:2023-08",
  "tatoeba:corpus:2024-07": "upstream:tatoeba:2024-07",
  "first-party:kanji-corpus:v1": "upstream:kanjidic2:2024-07",
};

/**
 * Look up a registered source definition by ID or known alias.
 */
export function getRegisteredSource(id: string): ProvenanceContract | null {
  if (!id) return null;
  const canonicalId = SOURCE_ALIASES[id] || id;
  return AUTHORITATIVE_SOURCE_REGISTRY[canonicalId] ?? null;
}

/**
 * Retrieve all registered source definitions.
 */
export function listAllRegisteredSources(): ProvenanceContract[] {
  return Object.values(AUTHORITATIVE_SOURCE_REGISTRY);
}

/**
 * Filter registered sources by domain.
 */
export function listSourcesByDomain(domain: SourceDomain): ProvenanceContract[] {
  return listAllRegisteredSources().filter((s) => s.domain === domain);
}

/**
 * Filter registered sources by type.
 */
export function listSourcesByType(type: SourceType): ProvenanceContract[] {
  return listAllRegisteredSources().filter((s) => s.type === type);
}

/**
 * Filter registered sources by operational status.
 */
export function listSourcesByStatus(status: SourceStatus): ProvenanceContract[] {
  return listAllRegisteredSources().filter((s) => s.status === status);
}
