import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SecurityCenter } from "@/components/auth/security-center";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/account/security");

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <a href="/" className="text-sm font-bold text-[#277a5c] underline">← Back to learning</a>
        <div className="mb-7 mt-5"><p className="text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">ACCOUNT SECURITY</p><h1 className="mt-1 font-serif text-4xl font-normal text-[#18231d]">Keep your progress protected</h1><p className="mt-2 text-sm text-[#657166]">Signed in as {session.user.email}</p></div>
        <SecurityCenter />
      </div>
    </main>
  );
}
