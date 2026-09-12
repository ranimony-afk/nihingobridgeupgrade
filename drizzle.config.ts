import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a plain Node process, so .env is not loaded for us.
loadDotenv({ path: ".env", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. Copy .env.example to .env and set it.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // Generated SQL is committed and reviewable; migrations are the only
  // mechanism that changes the production schema (DATABASE_OWNERSHIP §6).
  out: "./drizzle",
  dbCredentials: { url },
  // Fail loudly rather than silently dropping something during generation.
  strict: true,
  verbose: true,
});
