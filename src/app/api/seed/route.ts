import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDatabase();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("seed error", err);
    return Response.json(
      { ok: false, error: "Failed to seed database" },
      { status: 500 },
    );
  }
}
