#!/usr/bin/env node
/**
 * Structure guard.
 *
 * Fails if the frozen production layout drifts, or if a file that must never
 * be committed has appeared. Cheap enough to run in CI before the build.
 *
 * Usage: node scripts/check-structure.mjs
 */

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const REQUIRED_DIRECTORIES = [
  "src/app",
  "src/components",
  "src/services",
  "src/repositories",
  "src/db",
  "src/lib",
  "src/config",
  "src/types",
  "tests",
  "tests/unit",
  "tests/integration",
  "tests/api",
  "tests/e2e",
  "tests/smoke",
  "scripts",
  "docs",
  "reports",
];

const REQUIRED_FILES = [
  ".gitignore",
  ".env.example",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/api/health/route.ts",
  "src/db/index.ts",
  "src/db/schema.ts",
  "src/config/env.ts",
  "scripts/validate-env.mjs",
  "scripts/run-server-tests.mjs",
  "playwright.config.ts",
  "docs/TESTING.md",
  "docs/architecture/ARCHITECTURE_FREEZE.md",
  "docs/architecture/decisions/DEC-0015-authentication.md",
  "src/services/auth/service.ts",
  "src/lib/auth-guard.ts",
  "src/middleware.ts",
  "drizzle/meta/_journal.json",
  "drizzle/rollback/0003_knowledge_schema.down.sql",
  "drizzle/rollback/0004_learning_schema.down.sql",
  "drizzle/rollback/0005_srs_schema.down.sql",
  "scripts/migrate.mjs",
  "drizzle.config.ts",
];

/** Committing any of these is a security failure. */
const FORBIDDEN_FILES = [".env", ".env.local", ".env.production"];

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function gitIgnoresEnv() {
  try {
    const contents = await readFile(path.join(ROOT, ".gitignore"), "utf8");
    return contents.split(/\r?\n/).some((line) => line.trim() === ".env");
  } catch {
    return false;
  }
}

async function main() {
  const problems = [];

  for (const directory of REQUIRED_DIRECTORIES) {
    if (!(await exists(directory))) problems.push(`missing directory: ${directory}/`);
  }

  for (const file of REQUIRED_FILES) {
    if (!(await exists(file))) problems.push(`missing file: ${file}`);
  }

  if (!(await gitIgnoresEnv())) {
    problems.push(".gitignore must ignore .env");
  }

  // .env may exist locally; it must never be tracked by git.
  for (const file of FORBIDDEN_FILES) {
    if ((await exists(file)) && !(await gitIgnoresEnv())) {
      problems.push(`${file} exists but is not ignored`);
    }
  }

  if (problems.length > 0) {
    console.error("Structure check FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(
    `Structure check passed (${REQUIRED_DIRECTORIES.length} directories, ${REQUIRED_FILES.length} files).`,
  );
}

await main();
