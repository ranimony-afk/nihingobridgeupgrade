import Link from "next/link";
import { redirect } from "next/navigation";

import { getPreferences, getProfile } from "@/repositories/identity";
import { getCurrentUser } from "@/services/auth/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Protected page — requires a signed-in learner.
 *
 * The check runs here, in the server component, not only in middleware. A
 * middleware check can be skipped by a routing bug or a framework CVE
 * (CVE-2025-29927, GHSA-6gpp-xcg3-4w24); a check that guards the data fetch
 * itself cannot, because there is no path to the data that avoids it.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const [profile, preferences] = await Promise.all([
    getProfile(user.id),
    getPreferences(user.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-widest text-slate-400">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-50">
          Welcome back, {user.displayName}
        </h1>
        <p className="mt-2 text-slate-400">{user.email}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Profile</h2>
          <dl className="mt-4 space-y-2 text-slate-200">
            <div className="flex justify-between">
              <dt className="text-slate-400">Timezone</dt>
              <dd>{profile?.timezone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Locale</dt>
              <dd>{profile?.locale ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Target level</dt>
              <dd>{profile?.targetJlptLevel ? `N${profile.targetJlptLevel}` : "Not set"}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Study settings
          </h2>
          <dl className="mt-4 space-y-2 text-slate-200">
            <div className="flex justify-between">
              <dt className="text-slate-400">Daily goal</dt>
              <dd>{preferences?.dailyGoalMinutes ?? "—"} min</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Furigana</dt>
              <dd>{preferences?.furiganaMode ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">New cards / day</dt>
              <dd>{preferences?.srsDailyNewLimit ?? "—"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link
          href="/"
          className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
        >
          Home
        </Link>
        {user.roles.includes("admin") || user.roles.includes("super_admin") ? (
          <Link
            href="/admin"
            className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
          >
            Admin
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
