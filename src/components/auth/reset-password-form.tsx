"use client";

import { FormEvent, useState } from "react";

type ResetPasswordFormProps = { token?: string };

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const endpoint = token
        ? "/api/v1/auth/password/reset/confirm"
        : "/api/v1/auth/password/reset/request";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email }),
      });
      const body = (await response.json()) as { error?: string; message?: string; issues?: string[] };
      if (!response.ok) {
        setMessage(body.issues?.length ? `Password needs: ${body.issues.join(", ")}.` : body.error ?? "We could not process that request.");
        return;
      }
      setMessage(body.message ?? (token ? "Password updated. You can now sign in." : "If an eligible account exists, reset instructions will arrive shortly."));
    } catch {
      setMessage("The password service is unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
      <p className="mb-2 text-center text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">ACCOUNT RECOVERY</p>
      <h1 className="mb-2 text-center font-serif text-3xl font-normal text-[#18231d]">{token ? "Choose a new password" : "Reset your password"}</h1>
      <p className="mb-6 text-center text-sm leading-6 text-[#657166]">{token ? "A password change signs out your other active sessions." : "We will send a secure reset link if the account is eligible."}</p>
      {message && <p role="status" className="mb-4 rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}
      <form onSubmit={submit} className="space-y-4">
        {token ? <label className="block text-sm font-bold text-[#415247]">New password
          <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="new-password" />
        </label> : <label className="block text-sm font-bold text-[#415247]">Email address
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="email" />
        </label>}
        {token && <p className="-mt-2 text-xs leading-5 text-[#657166]">Use 12+ characters with uppercase, lowercase, number, and symbol.</p>}
        <button disabled={isSubmitting} className="w-full rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{isSubmitting ? "Please wait…" : token ? "Reset password" : "Send reset link"}</button>
      </form>
      <a href="/auth/sign-in" className="mt-5 block text-center text-xs font-bold text-[#277a5c] underline">Back to sign in</a>
    </section>
  );
}
