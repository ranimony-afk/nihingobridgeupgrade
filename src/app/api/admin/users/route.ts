import { desc, sql } from "drizzle-orm";

import { db } from "@/db";
import { identityUsers } from "@/db/schema";
import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { requireRoleAtLeast } from "@/lib/auth-guard";
import { resolvePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/users — administrative user listing.
 *
 * Demonstrates the three-state authorization contract:
 *   anonymous        → 401 UNAUTHENTICATED
 *   signed-in learner → 403 FORBIDDEN
 *   admin            → 200
 *
 * The role is read from the database through the session. An inbound
 * `x-admin-role` header — Repository B's pattern — has no effect here.
 */
export async function GET(request: Request) {
  try {
    await requireRoleAtLeast("admin");

    const params = new URL(request.url).searchParams;
    const page = resolvePagination({
      page: params.get("page"),
      pageSize: params.get("pageSize"),
    });

    const [rows, counted] = await Promise.all([
      db
        .select({
          id: identityUsers.id,
          email: identityUsers.email,
          displayName: identityUsers.displayName,
          status: identityUsers.status,
          createdAt: identityUsers.createdAt,
        })
        .from(identityUsers)
        .orderBy(desc(identityUsers.createdAt))
        .limit(page.limit)
        .offset(page.offset),
      db.select({ total: sql<number>`count(*)::int` }).from(identityUsers),
    ]);

    return jsonSuccess(
      rows,
      { page: page.page, pageSize: page.pageSize, total: counted[0]?.total ?? 0 },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return jsonFromError(error);
  }
}
