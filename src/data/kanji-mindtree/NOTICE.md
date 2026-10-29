# Kanji MindTree source-data notices

This directory contains two deliberately separate source-derived data artifacts. They have different upstreams and different licenses; one notice must not be used as a substitute for the other. The application code and NihongoBridge first-party study records are separate.

## KanjiVG structure slice

- **Artifact:** `kanjivg-structure-slice.json` (100 glyphs; 602 stroke paths; 617,047 bytes; SHA-256 `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862`).
- **Source:** [KanjiVG](https://github.com/KanjiVG/kanjivg), release `r20240807`, commit `a4b51d966d832544c371d566f9c84174e4beff3b`.
- **Original author/copyright:** Ulrich Apel.
- **License:** [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- **Project attribution:** <https://kanjivg.tagaini.net/>.
- **Changes:** extracted source SVG path geometry and literal group/path annotations for the bounded 100-character set; recorded source-file hashes; and derived structural-evidence graph nodes/edges only from literal `kvg:element` annotations. These transformations do not make the SVG groupings canonical semantic decomposition, dictionary radical identity, phonetic function, or historical/etymological claims.

This adapted KanjiVG-derived artifact retains CC BY-SA 3.0 attribution and share-alike requirements. The complete source archive and full corpus are not included.

## KANJIDIC2 facts slice

- **Artifact:** `kanjidic2-facts-slice.json` (100 records; 33 overlap the existing first-party MindTree seed and 67 additional grade-1 characters; 36,356 bytes; SHA-256 `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`).
- **Source data identity:** EDRDG KANJIDIC2 release `2023-08-20`, database version `2023-232`, file version `4`, source ID `upstream:kanjidic2:2023-08`.
- **Immutable archive:** `Jitendex/edrdg-dictionary-archive@9cb709b87f43c7bceb494eefbe7f8b8f42744502`, path `kanjidic2_xml/kanjidic2.xml.br`, Git blob `e6e448946b29480a765f167e9ee1cc3fc9314c6b`.
- **Archive SHA-256:** `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb` (895,754 bytes).
- **Decompressed XML SHA-256:** `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` (15,643,593 bytes; 13,108 records).
- **Current official license notice:** [EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html), inspected 2026-10-29. It states Creative Commons Attribution-ShareAlike 4.0 applies to KANJIDIC2 and derived data, replaces prior license statements, requires attribution and share-alike, and requires a regular update procedure. This notice is reproduced here for provenance; this is not legal advice or a claim of legal clearance.
- **Attribution:** KANJIDIC2, compiled and maintained by the Electronic Dictionary Research and Development Group (EDRDG). Project page: <https://www.edrdg.org/wiki/index.php/KANJIDIC2>.
- **Fields included:** English meanings, Japanese On/Kun readings, grade level, stroke count, and classical radical *index number*.
- **Fields excluded:** non-English meanings, separately credited SKIP/Pinyin/Korean and other third-party code/reading material, JMdict vocabulary, example sentences, and all third-party mnemonic text.
- **Changes:** filtered the verified XML to the existing 33 first-party MindTree characters plus 67 grade-1 characters selected by primary stroke count then Unicode scalar order, requiring a matching pinned KanjiVG SVG. Extracted only the fields listed above with the deterministic M3 generator. This slice is separate from the KanjiVG artifact and distributed under the source's CC BY-SA 4.0 terms.

The existing historical ETL contract and gate manifest still record CC BY-SA 3.0. M3 did not modify those historical database-ingestion gates; the current official EDRDG notice above is the license basis recorded for this separate MindTree artifact. Re-check the official terms and source revision on each refresh.

## First-party and derived product layers

- `src/data/kanji.ts` retains the 33 pre-existing NihongoBridge study records, vocabulary and radical selections. The two M2 story strings explicitly recorded as AI-revised (`男`, `箸`) are removed from that seed's mnemonic field and retained only in the candidate overlay below; 31 remaining seed stories are structured as first-party drafts.
- `src/data/kanji-mindtree/mnemonic-candidates.ts` contains 44 explicitly `ai_candidate` draft records: the two M2 AI-revised strings plus 42 newly authored candidate stories for additional supported characters. They have no reviewer/date evidence and cannot be approved or published. Another 25 supported characters have no mnemonic record. AI-assisted text remains an unpublished overlay and is hidden from all learner routes.
- Mnemonics are memory cues, not etymology, canonical component roles, or historical claims. Only a human-reviewed, non-AI-origin record with explicit approval/publication evidence may be served to learners. At M4 close, 75 records are drafts; review, approval, and publication counts are all zero. No reviewer identity or date is fabricated.
- The M4 content studio is development-only, offline, ephemeral, and uses browser download for deterministic JSON export. It does not authenticate reviewers, write files/server state, call APIs, persist data, or publish content. Source annotations and dictionary facts are review context, not verification of a mnemonic.
- Learning-graph edges and component/readings indexes are deterministic derived relationships with explanations. They are not inserted into the M1 structural-evidence graph.
- The application does not copy JMdict/Tatoeba rows, create learner cards, or store recall answers/progress. Existing app code and first-party content are not relicensed by these data notices.

## Refresh procedure

As a manual monthly maintenance check, inspect the current EDRDG notice and available KANJIDIC2 source/archive revision. If bytes, release metadata, or terms change, resolve and pin the exact new archive commit/blob, update the existing source gate only through its own separately reviewed process, regenerate the bounded KANJIDIC2 slice, regenerate the matching KanjiVG slice if selected coverage changes, update expected hashes and this notice/register, then run the focused source-contract tests and deterministic regeneration comparison. The current M3 implementation does not automate this cadence. Keep the full XML, archives, and extracted corpus out of Git.
