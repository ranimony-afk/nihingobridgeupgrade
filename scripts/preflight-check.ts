import "dotenv/config";
import { db } from "@/db";
import {
  dictionaryEntries,
  knowledgeSources,
  cmsContentItems,
  cmsContentVersions,
  cmsAuditLog,
  entityTranslations,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { validateEnvironmentSafety } from "./ingest-full-jmdict";

async function check() {
  const env = await validateEnvironmentSafety();
  console.log("SAFETY METADATA:");
  console.log("target classification:", env.classification);
  console.log("host:", env.host);
  console.log("port:", env.port);
  console.log("database name:", env.databaseName);
  console.log("role:", env.currentUser);
  console.log("schema:", env.currentSchema);
  console.log("identity hash:", env.identityHash);
  console.log("server address observed:", env.serverAddress ?? "unavailable");
  console.log("PostgreSQL version:", env.postgresVersion);

  const [dictCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(dictionaryEntries);
  const [sourcesCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(knowledgeSources);
  const [cmsItemsCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentItems);
  const [cmsVersionsCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentVersions);
  const [cmsAuditCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsAuditLog);
  const [transCount] = await db.select({ count: sql`cast(count(*) as int)` }).from(entityTranslations);

  const sourcesDist = await db
    .select({
      sourceRef: dictionaryEntries.sourceRef,
      count: sql`cast(count(*) as int)`,
    })
    .from(dictionaryEntries)
    .groupBy(dictionaryEntries.sourceRef);

  console.log("\nPRE-INVENTORY:");
  console.log("dictionary_entries count:", Number(dictCount.count));
  console.log("knowledge_sources count:", Number(sourcesCount.count));
  console.log("CMS items count:", Number(cmsItemsCount.count));
  console.log("CMS versions count:", Number(cmsVersionsCount.count));
  console.log("CMS audit count:", Number(cmsAuditCount.count));
  console.log("Translations count:", Number(transCount.count));
  console.log("Source distribution in dictionary_entries:", sourcesDist);

  // Check for NULL violations or duplicate IDs
  const [dupIdRows] = await db.select({
    count: sql`cast(count(*) - count(distinct id) as int)`,
  }).from(dictionaryEntries);
  console.log("Duplicate IDs in dictionary_entries:", Number(dupIdRows.count));

  const [nullCheck] = await db.select({
    nullHeadwords: sql`cast(count(*) filter (where headword is null) as int)`,
    nullReadings: sql`cast(count(*) filter (where reading is null) as int)`,
    nullRomaji: sql`cast(count(*) filter (where romaji is null) as int)`,
    nullSourceRef: sql`cast(count(*) filter (where source_ref is null) as int)`,
  }).from(dictionaryEntries);
  console.log("Null field check:", nullCheck);
}

check().catch(console.error);
