import { Lock, ShieldAlert } from "lucide-react";

/**
 * Server-rendered gate states for CMS admin pages. Shown when the
 * server-side capability check fails — no protected data is fetched and
 * no admin controls render in these states.
 */
export function GateCard({
  reason,
  role,
}: {
  reason: "unauthenticated" | "forbidden";
  role?: string;
}) {
  const Icon = reason === "unauthenticated" ? Lock : ShieldAlert;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      <Icon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
      <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
        {reason === "unauthenticated" ? "Sign-in required" : "Permission denied"}
      </h1>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
        {reason === "unauthenticated"
          ? "Your session expired or you are not signed in. Sign in to access CMS administration."
          : `This account${role ? ` (${role})` : ""} does not have CMS access. Contact an administrator if you need editorial permissions.`}
      </p>
    </div>
  );
}
