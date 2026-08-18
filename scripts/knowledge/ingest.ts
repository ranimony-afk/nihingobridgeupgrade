import "dotenv/config";

import { resolve, relative } from "node:path";
import { env } from "@/lib/env";
import { findDatasetDefinition, type KnowledgeDatasetKey } from "@/lib/knowledge/datasets";
import { importKnowledgeDataset } from "@/lib/knowledge/etl/importer";
import { logger } from "@/lib/logger";
import { pool } from "@/db";

type Arguments = {
  dataset?: string;
  input?: string;
  version?: string;
  mode?: "incremental" | "replace";
};

function parseArguments(argv: string[]): Arguments {
  const args: Arguments = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--dataset") args.dataset = value;
    if (argument === "--input") args.input = value;
    if (argument === "--version") args.version = value;
    if (argument === "--mode" && (value === "incremental" || value === "replace")) args.mode = value;
  }
  return args;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.dataset || !args.input || !args.version) {
    throw new Error("Usage: npx tsx scripts/knowledge/ingest.ts --dataset <key> --input <path> --version <source-version> [--mode incremental|replace]");
  }
  if (!findDatasetDefinition(args.dataset)) {
    throw new Error(`Unsupported dataset key: ${args.dataset}`);
  }

  const baseDirectory = resolve(env.KNOWLEDGE_DATA_DIR);
  const inputPath = resolve(args.input);
  if (relative(baseDirectory, inputPath).startsWith("..")) {
    throw new Error(`Input path must be inside KNOWLEDGE_DATA_DIR (${baseDirectory}).`);
  }

  const result = await importKnowledgeDataset({
    datasetKey: args.dataset as KnowledgeDatasetKey,
    inputPath,
    sourceVersion: args.version,
    mode: args.mode ?? "incremental",
  });
  logger.info({ component: "knowledge-etl", ...result }, "Knowledge import finished");
}

main()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, "Knowledge import failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
