"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

type Mode = "password" | "register" | "magic";

type SignInFormProps = {
  callbackUrl: string;
  hasGoogle: boolean;
  hasGithub: boolean;
  hasEmail: boolean;
  emailVerified: boolean | null;
};

export function SignInForm({
  callbackUrl,
  hasGoogle,
  hasGithub,
  hasEmail,
  emailVerified,
}: SignInFormProps) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [message, setMessage] = useState<string | null>(
    emailVerified === true ? "Your email has been verified. You can sign in now." : emailVerified === false ? "That verification link is invalid or expired." : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      if (mode === "register") {
        const response = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const body = (await response.json()) as { error?: string; issues?: string[]; message?: string };
        if (!response.ok) {
          setMessage(body.issues?.length ? `Password needs: ${body.issues.join(", ")}.` : body.error ?? "Registration could not be completed.");
          return;
        }
        setMessage(body.message ?? "Check your inbox for a verification link.");
        setMode("password");
        return;
      }

      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, twoFactorCode: needsMfa ? twoFactorCode : undefined, client: "web" }),
      });
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.code === "MFA_REQUIRED") {
        setNeedsMfa(true);
        setMessage("Enter the current code from your authenticator app.");
        return;
      }
      if (!response.ok) {
        setMessage(body.error ?? "We could not sign you in.");
        return;
      }
      window.location.assign(callbackUrl);
    } catch {
      setMessage("The authentication service is unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await signIn("resend", {
        email,
        redirect: false,
        callbackUrl,
      });
      setMessage(result?.error ? "We could not send a magic link. Please try again." : "Check your inbox for your secure sign-in link.");
    } catch {
      setMessage("We could not send a magic link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function continueWith(provider: "google" | "github") {
    await signIn(provider, { callbackUrl });
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
      <p className="mb-2 text-center text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">NIHONGOBRIDGE ACCOUNT</p>
      <h1 className="mb-2 text-center font-serif text-3xl font-normal text-[#18231d]">Welcome back</h1>
      <p className="mb-6 text-center text-sm leading-6 text-[#657166]">Keep your Japanese learning journey secure and in sync.</p>

      {message && <p role="status" className="mb-4 rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}

      <div className={`mb-5 grid ${hasEmail ? "grid-cols-3" : "grid-cols-2"} rounded-xl bg-[#edf0e9] p-1 text-xs font-bold`}>
        <button type="button" onClick={() => { setMode("password"); setNeedsMfa(false); }} className={`rounded-lg px-2 py-2 ${mode === "password" ? "bg-white text-[#277a5c] shadow-sm" : "text-[#657166]"}`}>Password</button>
        {hasEmail && <button type="button" onClick={() => { setMode("magic"); setNeedsMfa(false); }} className={`rounded-lg px-2 py-2 ${mode === "magic" ? "bg-white text-[#277a5c] shadow-sm" : "text-[#657166]"}`}>Magic link</button>}
        <button type="button" onClick={() => { setMode("register"); setNeedsMfa(false); }} className={`rounded-lg px-2 py-2 ${mode === "register" ? "bg-white text-[#277a5c] shadow-sm" : "text-[#657166]"}`}>Create</button>
      </div>

      {mode === "magic" ? (
        <form onSubmit={requestMagicLink} className="space-y-4">
          <label className="block text-sm font-bold text-[#415247]">Email address
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="email" />
          </label>
          <button disabled={isSubmitting} className="w-full rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{isSubmitting ? "Sending secure link…" : "Email me a magic link"}</button>
        </form>
      ) : (
        <form onSubmit={submitPassword} className="space-y-4">
          {mode === "register" && <label className="block text-sm font-bold text-[#415247]">Name
            <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="name" />
          </label>}
          <label className="block text-sm font-bold text-[#415247]">Email address
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="email" />
          </label>
          <label className="block text-sm font-bold text-[#415247]">Password
            <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete={mode === "register" ? "new-password" : "current-password"} />
          </label>
          {mode === "register" && <p className="-mt-2 text-xs leading-5 text-[#657166]">Use 12+ characters with uppercase, lowercase, number, and symbol.</p>}
          {needsMfa && <label className="block text-sm font-bold text-[#415247]">Authenticator or recovery code
            <input required value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#cdd7ca] bg-white px-3 py-3 outline-none ring-[#277a5c] focus:ring-2" autoComplete="one-time-code" />
          </label>}
          <button disabled={isSubmitting} className="w-full rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{isSubmitting ? "Please wait…" : mode === "register" ? "Create secure account" : "Sign in"}</button>
        </form>
      )}

      {mode === "password" && <a href="/auth/reset-password" className="mt-4 block text-center text-xs font-bold text-[#277a5c] underline">Forgot your password?</a>}

      {(hasGoogle || hasGithub) && <div className="mt-6 border-t border-[#dce3d8] pt-5">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-[#7b867c]">or continue with</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {hasGoogle && <button type="button" onClick={() => continueWith("google")} className="rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 text-sm font-bold text-[#415247]">Google</button>}
          {hasGithub && <button type="button" onClick={() => continueWith("github")} className="rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 text-sm font-bold text-[#415247]">GitHub</button>}
        </div>
      </div>}
    </section>
  );
}
