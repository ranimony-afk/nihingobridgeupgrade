import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { sql } from "drizzle-orm";

import { getKnowledgeStats, isKnowledgeSchemaProvisioned } from "@/repositories/knowledge";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe used by the platform health check and by Vercel.
 *
 * Returns 200 whenever PostgreSQL accepts a connection — an un-initialised
 * schema is reported through `knowledge.provisioned` instead of failing the
 * deploy, because schema creation (`drizzle-kit push`) and data loading
 * (`node etl/run-pipeline.mjs`) are separate, additive steps.
 */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "down",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }

  const provisioned = await isKnowledgeSchemaProvisioned();
  const knowledge = provisioned ? await getKnowledgeStats() : null;
  const note = provisioned
    ? knowledge && knowledge.kanji === 0
      ? "schema present but empty — run: node etl/run-pipeline.mjs"
      : null
    : "knowledge schema missing — run: npx drizzle-kit push --config drizzle.config.json && node etl/run-pipeline.mjs";

  return NextResponse.json({
    status: "ok",
    database: "up",
    knowledge: {
      provisioned,
      note,
      ...(knowledge ?? { kanji: 0, radicals: 0, components: 0, vocabulary: 0 }),
    },
  });
}
