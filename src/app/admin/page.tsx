import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAtLeast } from "@/services/auth/rbac";
import { getCurrentUser } from "@/services/auth/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Protected page — requires the admin role or higher.
 *
 * Two distinct outcomes, deliberately not collapsed into one:
 *   signed out          → redirect to /login (the user can fix this)
 *   signed in, no role  → 403 view (signing in again will not help)
 *
 * Redirecting an authenticated learner to /login would loop them: they are
 * already signed in, so the login page would bounce them straight back.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  if (!hasAtLeast(user, "admin")) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <p className="text-sm uppercase tracking-widest text-amber-400">403 — Forbidden</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">Admin access required</h1>
        <p className="mt-3 text-slate-400">
          You are signed in as {user.email}, but this area needs the admin role.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 w-fit rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-slate-400">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-50">Administration</h1>
      <p className="mt-3 text-slate-400">
        Signed in as {user.displayName} ({user.roles.join(", ")}).
      </p>

      <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Available endpoints
        </h2>
        <ul className="mt-4 space-y-2 font-mono text-sm text-slate-300">
          <li>GET /api/admin/users</li>
        </ul>
      </section>

      <Link
        href="/dashboard"
        className="mt-10 inline-block rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
