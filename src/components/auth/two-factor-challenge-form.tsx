"use client";

import { FormEvent, useState } from "react";

export function TwoFactorChallengeForm({ challenge }: { challenge: string | undefined }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      setMessage("This sign-in challenge is invalid or has expired.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/auth/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challenge, code }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "We could not verify that code.");
        return;
      }
      window.location.assign("/");
    } catch {
      setMessage("The two-factor service is unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
      <p className="mb-2 text-center text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">SECOND FACTOR REQUIRED</p>
      <h1 className="mb-2 text-center font-serif text-3xl font-normal text-[#18231d]">Verify your sign-in</h1>
      <p className="mb-6 text-center text-sm leading-6 text-[#657166]">Enter the current six-digit authenticator code or one of your recovery codes.</p>
      {message && <p role="status" className="mb-4 rounded-xl bg-[#fff0e9] px-4 py-3 text-sm text-[#8a4537]">{message}</p>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-bold text-[#415247]">Authenticator or recovery code
          <input required value={code} onChange={(event) => setCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="one-time-code" autoFocus />
        </label>
        <button disabled={isSubmitting} className="w-full rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{isSubmitting ? "Verifying…" : "Verify and continue"}</button>
      </form>
      <a href="/auth/sign-in" className="mt-5 block text-center text-xs font-bold text-[#277a5c] underline">Back to sign in</a>
    </section>
  );
}
