import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/services/auth/session-cookie";

export const dynamic = "force-dynamic";

/** Only allow same-origin relative paths, so `?next=` cannot become an open redirect. */
function safeNext(value: string | undefined): string {
  if (!value) return "/dashboard";
  // Reject absolute URLs and protocol-relative paths ("//evil.com").
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  // Already signed in: send them where they were going rather than showing a
  // sign-in form they do not need.
  const user = await getCurrentUser();
  if (user) redirect(destination);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-widest text-slate-400">NihongoBridge</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-50">Sign in</h1>
      <p className="mt-3 text-slate-400">
        Authentication endpoints are available at <code>/api/auth/login</code> and{" "}
        <code>/api/auth/register</code>. The sign-in form arrives with the web UI phase.
      </p>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
        <p className="font-medium text-slate-200">After signing in you will return to</p>
        <p className="mt-1 font-mono text-slate-400">{destination}</p>
      </div>

      <Link
        href="/"
        className="mt-8 w-fit rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        Back to home
      </Link>
    </main>
  );
}
