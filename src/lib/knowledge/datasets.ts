import "server-only";

import { db } from "@/db";
import { knowledgeDatasets } from "@/db/schema";

export type KnowledgeDatasetKey =
  | "jmdict"
  | "jmdict_furigana"
  | "kanjidic2"
  | "jmnedict"
  | "tatoeba"
  | "unidic"
  | "pitch_accent"
  | "kanjivg"
  | "frequency"
  | "jlpt_vocabulary"
  | "grammar"
  | "idioms"
  | "collocations"
  | "open_audio";

type DatasetDefinition = {
  key: KnowledgeDatasetKey;
  title: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  format: string;
  metadata?: Record<string, unknown>;
};

export const knowledgeDatasetRegistry: readonly DatasetDefinition[] = [
  {
    key: "jmdict",
    title: "JMdict Japanese-Multilingual Dictionary",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
    license: "Creative Commons Attribution-ShareAlike 3.0",
    attribution: "Electronic Dictionary Research and Development Group (EDRDG)",
    format: "xml",
  },
  {
    key: "jmdict_furigana",
    title: "JMDict Furigana",
    sourceUrl: "https://github.com/Doublevil/JmdictFurigana",
    license: "Upstream repository license; verify release metadata before import",
    attribution: "JMDict Furigana maintainers and EDRDG source data",
    format: "jsonl",
  },
  {
    key: "kanjidic2",
    title: "KANJIDIC2",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
    license: "Creative Commons Attribution-ShareAlike 3.0",
    attribution: "Electronic Dictionary Research and Development Group (EDRDG)",
    format: "xml",
  },
  {
    key: "jmnedict",
    title: "JMnedict Japanese Proper Names Dictionary",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMnedict",
    license: "Creative Commons Attribution-ShareAlike 3.0",
    attribution: "Electronic Dictionary Research and Development Group (EDRDG)",
    format: "xml",
  },
  {
    key: "tatoeba",
    title: "Tatoeba Sentence Corpus",
    sourceUrl: "https://tatoeba.org/en/downloads",
    license: "Tatoeba export licensing; preserve per-record attribution and license metadata",
    attribution: "Tatoeba contributors",
    format: "tsv",
  },
  {
    key: "unidic",
    title: "UniDic Morphological Dictionary",
    sourceUrl: "https://clrd.ninjal.ac.jp/unidic/",
    license: "UniDic license; accept and retain the selected release terms before import",
    attribution: "National Institute for Japanese Language and Linguistics (NINJAL)",
    format: "csv",
  },
  {
    key: "pitch_accent",
    title: "Pitch Accent Dataset",
    sourceUrl: "https://www.edrdg.org/",
    license: "Import only a source with redistribution rights; retain its upstream license",
    attribution: "Configured pitch-accent source",
    format: "jsonl",
  },
  {
    key: "kanjivg",
    title: "KanjiVG",
    sourceUrl: "https://kanjivg.tagaini.net/",
    license: "Creative Commons Attribution-ShareAlike 3.0",
    attribution: "KanjiVG contributors",
    format: "svg-directory",
  },
  {
    key: "frequency",
    title: "Japanese Frequency Lists",
    sourceUrl: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Japanese",
    license: "Source-specific; retain import release and attribution metadata",
    attribution: "Configured frequency-list source",
    format: "tsv",
  },
  {
    key: "jlpt_vocabulary",
    title: "JLPT Vocabulary Source",
    sourceUrl: "https://www.jlpt.jp/e/",
    license: "Use a licensed or internally authored vocabulary source; JLPT does not publish an official vocabulary list",
    attribution: "Configured licensed JLPT vocabulary source",
    format: "jsonl",
  },
  {
    key: "grammar",
    title: "Japanese Grammar Database",
    sourceUrl: "https://www.edrdg.org/",
    license: "Configured licensed or internally authored grammar content",
    attribution: "Configured grammar source",
    format: "jsonl",
  },
  {
    key: "idioms",
    title: "Japanese Idiom Database",
    sourceUrl: "https://www.edrdg.org/",
    license: "Configured licensed or internally authored idiom content",
    attribution: "Configured idiom source",
    format: "jsonl",
  },
  {
    key: "collocations",
    title: "Japanese Collocation Database",
    sourceUrl: "https://clrd.ninjal.ac.jp/",
    license: "Configured licensed collocation source",
    attribution: "Configured collocation source",
    format: "jsonl",
  },
  {
    key: "open_audio",
    title: "Open Japanese Audio",
    sourceUrl: "https://commons.wikimedia.org/",
    license: "Per-asset open license; retain creator, source URL, and license",
    attribution: "Configured open-audio source",
    format: "jsonl",
  },
];

export async function syncKnowledgeDatasetRegistry() {
  const result = [] as Array<typeof knowledgeDatasets.$inferSelect>;
  for (const dataset of knowledgeDatasetRegistry) {
    const [stored] = await db
      .insert(knowledgeDatasets)
      .values({ ...dataset, metadata: dataset.metadata ?? {} })
      .onConflictDoUpdate({
        target: knowledgeDatasets.key,
        set: {
          title: dataset.title,
          sourceUrl: dataset.sourceUrl,
          license: dataset.license,
          attribution: dataset.attribution,
          format: dataset.format,
          metadata: dataset.metadata ?? {},
          updatedAt: new Date(),
        },
      })
      .returning();
    result.push(stored);
  }
  return result;
}

export function findDatasetDefinition(key: string): DatasetDefinition | undefined {
  return knowledgeDatasetRegistry.find((dataset) => dataset.key === key);
}
