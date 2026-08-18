"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("student@nihongobridge.local");
  const [password, setPassword] = useState("bridge-audit");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [magic, setMagic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [providers, setProviders] = useState({ google: false, github: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/auth/providers")
      .then((response) => response.json())
      .then((data: { data?: { google: boolean; github: boolean } }) => {
        if (data.data) setProviders(data.data);
      });
    const token = params.get("magic");
    if (!token) return;
    setBusy(true);
    void fetch("/api/v1/auth/magic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json())
      .then((data: { ok?: boolean; error?: string }) => {
        setBusy(false);
        if (!data.ok) {
          setError(data.error ?? "Magic link failed");
          return;
        }
        router.push(params.get("from") || "/learn");
        router.refresh();
      });
  }, [params, router]);

  async function login() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, otp: otp || undefined, challengeId }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      data?: { requires2fa?: boolean; challengeId?: string };
    };
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    if (data.data?.requires2fa && data.data.challengeId) {
      setChallengeId(data.data.challengeId);
      setNote("Enter the 6-digit authenticator code.");
      return;
    }
    router.push(params.get("from") || "/learn");
    router.refresh();
  }

  async function sendMagic() {
    setBusy(true);
    const response = await fetch("/api/v1/auth/magic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { data?: { devLink?: string } };
    setBusy(false);
    setMagic(data.data?.devLink ?? "");
    setNote("Magic link queued. In this environment it is also shown below.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f7] px-4">
      <section className="card w-full max-w-md p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#1cb0f6]">Phase 3</p>
        <h1 className="mt-2 text-3xl font-black">Sign in</h1>
        <p className="mt-2 text-sm text-[#777]">Email, magic link, or OAuth. Guest path cookies still work.</p>
        <input className="mt-5 w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 font-bold" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input className="mt-3 w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 font-bold" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {challengeId ? (
          <input className="mt-3 w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 font-bold" placeholder="123 456" value={otp} onChange={(event) => setOtp(event.target.value)} />
        ) : null}
        {error ? <p className="mt-3 font-bold text-[#ff4b4b]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm font-bold text-[#58a700]">{note}</p> : null}
        <button className="press mt-5 w-full bg-[#58cc02] py-3 text-white" disabled={busy} onClick={login} type="button">
          {challengeId ? "Verify 2FA" : "Email login"}
        </button>
        <button className="press mt-2 w-full bg-white py-3" disabled={busy} onClick={sendMagic} type="button">
          Email me a magic link
        </button>
        {magic ? (
          <a className="mt-3 block break-all text-sm font-bold text-[#1cb0f6]" href={magic}>
            {magic}
          </a>
        ) : null}
        <div className="mt-4 grid gap-2">
          {providers.google ? (
            <button className="press bg-white py-3" type="button" onClick={() => signIn("google", { callbackUrl: "/learn" })}>
              Continue with Google
            </button>
          ) : (
            <p className="text-xs font-bold text-[#777]">Google OAuth waits for AUTH_GOOGLE_ID / SECRET.</p>
          )}
          {providers.github ? (
            <button className="press bg-white py-3" type="button" onClick={() => signIn("github", { callbackUrl: "/learn" })}>
              Continue with GitHub
            </button>
          ) : (
            <p className="text-xs font-bold text-[#777]">GitHub OAuth waits for AUTH_GITHUB_ID / SECRET.</p>
          )}
        </div>
        <p className="mt-6 text-sm font-bold">
          <Link href="/register" className="text-[#1cb0f6]">
            Create an account
          </Link>
          {" · "}
          <Link href="/forgot-password">Forgot password</Link>
        </p>
      </section>
    </main>
  );
}
