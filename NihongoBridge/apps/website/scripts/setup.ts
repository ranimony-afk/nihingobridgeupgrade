import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db";
import { ensureSeed } from "../src/lib/seed";
import { sql } from "drizzle-orm";

async function runSetup() {
  console.log("======================================================================");
  console.log("⚙️  Nihongo Bridge Unified Platform - Centralized Bootstrap Setup");
  console.log("======================================================================");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ Setup failed: DATABASE_URL is not configured in process.env");
    process.exit(1);
  }

  console.log("⏳ Checking database connection...");
  try {
    await db.execute(sql`select 1`);
    console.log("✅ Connection verified successfully!");
  } catch (err) {
    console.error("❌ Setup failed: Database connectivity refused.", (err as Error).message);
    process.exit(1);
  }

  console.log("⏳ Applying schema migrations...");
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("✅ Database schema migrated to latest snapshot successfully!");
  } catch (err) {
    console.error("❌ Setup failed: Schema migration failed.", (err as Error).message);
    process.exit(1);
  }

  console.log("⏳ Injecting idempotent production seed data...");
  try {
    await ensureSeed();
    console.log("✅ Seed database records ingested successfully!");
  } catch (err) {
    console.error("❌ Setup failed: Database seeding failed.", (err as Error).message);
    process.exit(1);
  }

  console.log("⏳ Validating tables presence...");
  try {
    const tableCounts = await db.execute(sql`
      SELECT count(*) as total_tables 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const totalTables = tableCounts.rows[0]?.total_tables ?? "—";
    console.log(`✅ Platform schema verified! Total active public tables: ${totalTables}`);
  } catch (err) {
    console.error("⚠️ Validation failed: could not count database tables.", (err as Error).message);
  }

  console.log("======================================================================");
  console.log("🎉 SUCCESS: Platform database bootstrap is complete & fully ready!");
  console.log("======================================================================");
  process.exit(0);
}

runSetup();
export {};
