import { NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import {
  DEFAULT_SCHEDULER_KEY,
  listSchedulerKeys,
  SCHEDULER_PLUGIN_COUNT,
} from "@/services/srs/scheduler";

export const dynamic = "force-dynamic";

/**
 * GET /api/srs/schedulers
 * Enumerates every registered scheduling algorithm with its declarative
 * parameter schema and a truthful simulated interval ladder.
 *
 * This endpoint is the proof that no algorithm is hard-coded into the DB:
 * the list is derived entirely from the code registry.
 */
export async function GET() {
  try {
    const schedulers = SrsService.listAvailableSchedulers();

    return NextResponse.json({
      success: true,
      defaultSchedulerKey: DEFAULT_SCHEDULER_KEY,
      registrySize: SCHEDULER_PLUGIN_COUNT,
      registeredKeys: listSchedulerKeys(),
      count: schedulers.length,
      schedulers,
      architecture: {
        storageModel:
          "Database stores scheduler_key (string) + scheduler_params (jsonb) only. All interval math lives in versioned code strategies.",
        addAlgorithmSteps: [
          "Create src/services/srs/strategies/<name>.ts exporting an SrsScheduler",
          "Append it to the PLUGINS array in src/services/srs/scheduler.ts",
          "Decks can immediately reference it by key — no migration required",
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list schedulers";
    console.error("GET /api/srs/schedulers error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
