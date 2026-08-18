import "dotenv/config";

import { pool } from "@/db";
import { validateKnowledgeImportRun } from "@/lib/knowledge/validation";
import { logger } from "@/lib/logger";

async function main() {
  const runId = process.argv[process.argv.indexOf("--run") + 1];
  if (!runId) {
    throw new Error("Usage: npx tsx scripts/knowledge/validate.ts --run <knowledge-import-run-id>");
  }
  const result = await validateKnowledgeImportRun(runId);
  logger.info({ component: "knowledge-validation", ...result }, "Knowledge validation completed");
}

main()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, "Knowledge validation failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
