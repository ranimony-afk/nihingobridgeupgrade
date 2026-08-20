/**
 * Data export utilities — dump knowledge data for offline packs,
 * mobile app caching, or backup purposes.
 */

import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "../adapters/db";

/**
 * Export dictionary entries to a JSONL file for offline/mobile use.
 */
export async function exportDictionaryJsonl(outputDir: string): Promise<number> {
  const db = getDb();
  fs.mkdirSync(outputDir, { recursive: true });

  const outPath = path.join(outputDir, "dictionary.jsonl");
  const stream = fs.createWriteStream(outPath);

  const entries = await db
    .select()
    .from(schema.dictionaryEntries)
    .orderBy(schema.dictionaryEntries.headword);

  for (const entry of entries) {
    stream.write(JSON.stringify(entry) + "\n");
  }

  stream.end();
  console.log(`[export] Wrote ${entries.length} dictionary entries to ${outPath}`);
  return entries.length;
}
