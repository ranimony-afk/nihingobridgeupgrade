import { getStaffSession } from "@/lib/audit/auth";
import { cmsOverview, queueNotification, upsertPost, upsertSeo } from "@/lib/cms/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: await cmsOverview() });
}

export async function POST(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json()) as Record<string, string | undefined> & { action?: string };

  if (body.action === "post") {
    const id = await upsertPost({
      slug: body.slug ?? `post-${Date.now()}`,
      title: body.title ?? "Untitled",
      excerpt: body.excerpt ?? "",
      body: body.body ?? "",
      status: body.status ?? "draft",
    });
    return Response.json({ ok: true, data: { id } });
  }
  if (body.action === "notify") {
    const id = await queueNotification({
      title: body.title ?? "Notice",
      body: body.body ?? "",
      audience: body.audience ?? "all",
    });
    return Response.json({ ok: true, data: { id } });
  }
  if (body.action === "seo") {
    await upsertSeo({
      path: body.path ?? "/",
      title: body.title ?? "",
      description: body.description ?? "",
      noindex: body.noindex === "true",
    });
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
