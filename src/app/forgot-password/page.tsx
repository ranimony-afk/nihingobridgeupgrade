"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    const response = await fetch("/api/v1/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "forgot", email }),
    });
    const data = (await response.json()) as { data?: { devLink?: string } };
    setLink(data.data?.devLink ?? null);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-black">Reset password</h1>
        <input className="mt-5 w-full rounded-2xl border-2 px-3 py-2 font-bold" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <button className="press mt-4 w-full bg-[#1cb0f6] py-3 text-white" onClick={submit} type="button">
          Send reset link
        </button>
        {link ? (
          <a className="mt-3 block break-all text-sm font-bold text-[#1cb0f6]" href={link}>
            {link}
          </a>
        ) : null}
      </section>
    </main>
  );
}
