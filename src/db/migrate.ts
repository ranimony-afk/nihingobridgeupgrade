import "dotenv/config";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/db";
import { logger } from "@/lib/logger";

async function runMigrations() {
  try {
    logger.info({ component: "migrations" }, "Applying Drizzle migrations");
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.info({ component: "migrations" }, "Drizzle migrations applied");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  logger.fatal({ err: error }, "Drizzle migration failed");
  process.exitCode = 1;
});
