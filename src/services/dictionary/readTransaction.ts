import "server-only";

import { pool, type db } from "@/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

export type DictionaryReadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lease one client explicitly: Drizzle cannot identify the application's lazy
 * pool proxy with `instanceof Pool`. Releasing in our own finally also covers
 * a failed BEGIN, which occurs before Drizzle's transaction cleanup block.
 */
export async function withDictionaryRead<T>(
  read: (tx: DictionaryReadTransaction) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  let failed = false;
  try {
    return await drizzle(client).transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return read(tx);
    }, { accessMode: "read only" });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Discard a potentially broken or still-in-transaction client on failure.
    client.release(failed || undefined);
  }
}
