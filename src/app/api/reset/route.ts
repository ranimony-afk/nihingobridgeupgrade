import { resetAllProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetAllProgress();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("reset error", err);
    return Response.json({ ok: false, error: "Failed to reset" }, { status: 500 });
  }
}
