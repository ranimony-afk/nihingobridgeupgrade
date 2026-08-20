"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; data?: { verifyLink?: string } };
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "Could not register");
      return;
    }
    setLink(data.data?.verifyLink ?? null);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f7] px-4">
      <section className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-black">Create account</h1>
        <p className="mt-2 text-sm text-[#777]">Creates an identity user and a linked LMS learner.</p>
        <input className="mt-5 w-full rounded-2xl border-2 px-3 py-2 font-bold" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="mt-3 w-full rounded-2xl border-2 px-3 py-2 font-bold" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input className="mt-3 w-full rounded-2xl border-2 px-3 py-2 font-bold" type="password" placeholder="Password (8+)" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="mt-3 font-bold text-[#ff4b4b]">{error}</p> : null}
        <button className="press mt-5 w-full bg-[#58cc02] py-3 text-white" disabled={busy} onClick={submit} type="button">
          Register
        </button>
        {link ? (
          <p className="mt-3 text-sm">
            Verify email:{" "}
            <a className="font-bold text-[#1cb0f6]" href={link}>
              {link}
            </a>
          </p>
        ) : null}
        <Link href="/login" className="mt-4 block text-sm font-bold text-[#1cb0f6]">
          Already have an account
        </Link>
      </section>
    </main>
  );
}
