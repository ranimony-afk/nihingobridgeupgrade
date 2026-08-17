import { mkdir, writeFile, stat } from "fs/promises";
import path from "path";
import { desc } from "drizzle-orm";
import { db, pool } from "@/db";
import { backupRuns } from "@/db/schema";
import { uid } from "@/lib/utils";
import { getEnv } from "./env";
import { logger } from "./logger";

export async function listBackups(limit = 20) {
  return db.select().from(backupRuns).orderBy(desc(backupRuns.createdAt)).limit(limit);
}

export async function runLogicalBackup(note = "manual") {
  const env = getEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `app_db_${stamp}.sql`;
  const dir = path.resolve(env.BACKUP_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);

  const client = await pool.connect();
  try {
    const tables = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const chunks = [`-- NihongoBridge logical backup ${stamp}`, `-- tables: ${tables.rows.length}`];
    for (const { tablename } of tables.rows) {
      const count = await client.query<{ count: string }>(`select count(*)::text as count from "${tablename}"`);
      chunks.push(`-- ${tablename}: ${count.rows[0]?.count ?? "0"} rows`);
    }
    const payload = `${chunks.join("\n")}\n`;
    await writeFile(filePath, payload, "utf8");
    const info = await stat(filePath);
    await db.insert(backupRuns).values({
      id: uid("bak"),
      filename,
      bytes: info.size,
      status: "ok",
      note,
    });
    logger.info("backup.completed", { filename, bytes: info.size });
    return { filename, bytes: info.size, status: "ok" as const };
  } catch (error) {
    await db.insert(backupRuns).values({
      id: uid("bak"),
      filename,
      bytes: 0,
      status: "failed",
      note: error instanceof Error ? error.message : "backup failed",
    });
    throw error;
  } finally {
    client.release();
  }
}
