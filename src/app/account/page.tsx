import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getIdentity();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1cb0f6]">Identity</p>
      <h1 className="text-3xl font-black">Account security</h1>
      {!user ? (
        <p className="mt-4">
          <Link href="/login" className="font-black text-[#1cb0f6]">
            Sign in
          </Link>{" "}
          to manage 2FA, sessions, and verification.
        </p>
      ) : (
        <AccountPanel
          email={user.email}
          role={user.role}
          plan={user.plan}
          verified={Boolean(user.emailVerifiedAt)}
          totpEnabled={user.totpEnabled}
        />
      )}
    </main>
  );
}
