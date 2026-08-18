import { Suspense } from "react";
import { VerifyEmail } from "@/components/VerifyEmail";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center">Loading…</main>}>
      <VerifyEmail />
    </Suspense>
  );
}
