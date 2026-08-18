import { Suspense } from "react";
import { ResetForm } from "@/components/ResetForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center">Loading…</main>}>
      <ResetForm />
    </Suspense>
  );
}
