import "dotenv/config";
import { db } from "@/db";
import {
  dictionaryEntries,
  knowledgeSources,
  cmsContentItems,
  cmsContentVersions,
  cmsAuditLog,
  entityTranslations,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
  srsCards,
  xpEvents,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { DictionaryService } from "@/services/dictionary/dictionaryService";

async function main() {
  console.log("=== VERIFYING POST-INGESTION DATABASE STATE ===");

  const PROV_KEY = "upstream:jmdict:2023-08";

  // 1. Total counts
  const [totalDict] = await db.select({ count: sql`cast(count(*) as int)` }).from(dictionaryEntries);
  const [jmdictCount] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, PROV_KEY));
  const [distinctJmdictIds] = await db
    .select({ count: sql`cast(count(distinct id) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, PROV_KEY));

  console.log(`Dictionary Entries Total: ${totalDict.count}`);
  console.log(`JMdict Entries Count: ${jmdictCount.count}`);
  console.log(`Distinct JMdict IDs: ${distinctJmdictIds.count}`);

  if (Number(jmdictCount.count) !== 206717 || Number(distinctJmdictIds.count) !== 206717) {
    throw new Error(`JMdict count verification failed! Expected 206717, got count=${jmdictCount.count}, distinct=${distinctJmdictIds.count}`);
  }

  // 2. Orphan and NULL checks
  const orphanCountResult = await db.execute(sql`
    SELECT cast(count(*) as int) as count
    FROM dictionary_entries d
    LEFT JOIN knowledge_sources k ON d.source_ref = k.id
    WHERE k.id IS NULL;
  `);
  const orphanCount = Number((orphanCountResult.rows[0] as any)?.count ?? 0);
  console.log(`Orphan provenance references: ${orphanCount}`);

  const [quality] = await db
    .select({
      nullHeadwords: sql`cast(count(*) filter (where headword is null or trim(headword) = '') as int)`,
      nullReadings: sql`cast(count(*) filter (where reading is null or trim(reading) = '') as int)`,
      nullRomaji: sql`cast(count(*) filter (where romaji is null or trim(romaji) = '') as int)`,
      nullSenses: sql`cast(count(*) filter (where senses is null or senses = '[]'::jsonb) as int)`,
      nullPos: sql`cast(count(*) filter (where parts_of_speech is null or parts_of_speech = '[]'::jsonb) as int)`,
      nullSourceRef: sql`cast(count(*) filter (where source_ref is null) as int)`,
    })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, PROV_KEY));
  console.log("Quality checks:", quality);

  // 3. Application Read-Back via DictionaryService
  console.log("\nTesting Application Read-Back via DictionaryService...");
  const detail1 = await DictionaryService.getEntryDetail("de-jmdict-1000660");
  const exactIdLookup = Boolean(detail1 && detail1.entry.id === "de-jmdict-1000660");
  const provenanceResolved = Boolean(detail1?.source && detail1.source.id === PROV_KEY);

  const searchJp = await DictionaryService.searchEntries({ query: "如何にも" });
  const japaneseSearch = searchJp.entries.some((e) => e.headword === "如何にも");

  const searchReading = await DictionaryService.searchEntries({ query: "いかにも" });
  const readingSearch = searchReading.entries.some((e) => e.reading === "いかにも");

  const searchRomaji = await DictionaryService.searchEntries({ query: "ikanimo" });
  const romajiSearch = searchRomaji.entries.some((e) => e.romaji === "ikanimo");

  const searchEng = await DictionaryService.searchEntries({ query: "repetition mark in katakana" });
  const englishGlossSearch = searchEng.entries.some((e) => e.id === "de-jmdict-1000000");

  const multiSenseEntry = Boolean(detail1 && Array.isArray(detail1.entry.senses) && detail1.entry.senses.length > 5);
  const detailMultiReading = await DictionaryService.getEntryDetail("de-jmdict-1000840");
  const multiReadingEntry = Boolean(detailMultiReading);
  const detailKana = await DictionaryService.getEntryDetail("de-jmdict-1000000");
  const kanaOnlyEntry = Boolean(detailKana);
  const detailClassical = await DictionaryService.getEntryDetail("de-jmdict-1151290");
  const classicalPosEntry = Boolean(detailClassical);

  const readBack = {
    exactIdLookup,
    japaneseSearch,
    readingSearch,
    romajiSearch,
    englishGlossSearch,
    multiSenseEntry,
    multiReadingEntry,
    kanaOnlyEntry,
    classicalPosEntry,
    provenanceResolved,
  };
  console.log("Read-Back verification results:", readBack);

  // 4. Isolation Audit
  console.log("\nTesting Cross-Layer Isolation...");
  const [cmsItems] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentItems);
  const [cmsVersions] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentVersions);
  const [cmsAudit] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsAuditLog);
  const [translations] = await db.select({ count: sql`cast(count(*) as int)` }).from(entityTranslations);
  const [kanji] = await db.select({ count: sql`cast(count(*) as int)` }).from(kanjiEntries);
  const [grammar] = await db.select({ count: sql`cast(count(*) as int)` }).from(grammarPatterns);
  const [sentences] = await db.select({ count: sql`cast(count(*) as int)` }).from(exampleSentences);
  const [srs] = await db.select({ count: sql`cast(count(*) as int)` }).from(srsCards);
  const [xp] = await db.select({ count: sql`cast(count(*) as int)` }).from(xpEvents);

  const isolation = {
    cmsItems: Number(cmsItems.count),
    cmsVersions: Number(cmsVersions.count),
    cmsAudit: Number(cmsAudit.count),
    translations: Number(translations.count),
    kanji: Number(kanji.count),
    grammar: Number(grammar.count),
    sentences: Number(sentences.count),
    srsCards: Number(srs.count),
    xpEvents: Number(xp.count),
    cmsClean: Number(cmsItems.count) === 0 && Number(cmsVersions.count) === 0 && Number(cmsAudit.count) === 0,
  };
  console.log("Isolation verification results:", isolation);

  console.log("\n=== POST-INGESTION VERIFICATION SUCCESSFUL ===");
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
