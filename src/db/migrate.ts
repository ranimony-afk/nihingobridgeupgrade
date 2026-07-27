import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

async function runMigration() {
  console.log("⏳ Running programmatic migrations...");
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("✅ Migrations applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
