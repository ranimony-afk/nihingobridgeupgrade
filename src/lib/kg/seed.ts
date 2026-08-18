import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, kgLexemes, systemSettings } from "@/db/schema";
import { uid } from "@/lib/utils";
import { enrichDictionary } from "@/lib/dict/enrich";
import { importCoreCorpus } from "./import";

export async function ensureKgSeed() {
  const existing = await db.select({ id: kgLexemes.id }).from(kgLexemes).limit(1);
  if (existing.length === 0) {
    await importCoreCorpus();
  }
  const dict = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase6_dict"));
  if (dict.length === 0) {
    await enrichDictionary();
  }
  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase5_kg"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase5_kg", value: "1" });
    await db.insert(auditEvents).values({
      id: uid("aev"),
      findingId: null,
      actorId: "system",
      action: "phase5",
      detail: "Japanese knowledge graph core corpus imported",
    });
  }
}
