"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("sensei@nihongobridge.local");
  const [password, setPassword] = useState("bridge-audit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0f172a] px-4">
      <section className="card w-full max-w-md p-8 text-[#3c3c3c]">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Phase 2</p>
        <h1 className="mt-2 text-3xl font-black">Architect login</h1>
        <p className="mt-2 text-sm text-[#777]">
          Dual-stack staff gate: HMAC cookie plus Auth.js JWT. Existing LMS learner cookies stay valid.
        </p>
        <label className="mt-6 block text-xs font-extrabold uppercase tracking-widest text-[#777]">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 text-base font-bold text-[#3c3c3c]"
          />
        </label>
        <label className="mt-4 block text-xs font-extrabold uppercase tracking-widest text-[#777]">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 text-base font-bold text-[#3c3c3c]"
          />
        </label>
        {error ? <p className="mt-3 font-bold text-[#ff4b4b]">{error}</p> : null}
        <button className="press mt-6 w-full bg-[#58cc02] py-3 text-white" disabled={busy} onClick={submit} type="button">
          {busy ? "Checking…" : "Enter CMS"}
        </button>
      </section>
    </main>
  );
}
