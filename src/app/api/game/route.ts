import { handleGame, type GameAction } from "@/lib/game";
import { trackEvent } from "@/lib/infra/analytics";
import { reportError } from "@/lib/infra/errors";
import { logger } from "@/lib/infra/logger";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({
    key: clientKey(request),
    bucket: "game",
    limit: 80,
    windowSec: 60,
  });
  if (!limited.allowed) {
    return Response.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as GameAction;
    logger.info("game.action", { action: body.action });
    const result = await handleGame(body);
    void trackEvent({ name: "game_action", path: "/api/game", meta: { action: body.action } }).catch(() => undefined);
    const status = "status" in result && typeof result.status === "number" ? result.status : 200;
    return Response.json(result, { status });
  } catch (error) {
    await reportError(error, "api.game");
    return Response.json({ ok: false, error: "Game action failed" }, { status: 500 });
  }
}
