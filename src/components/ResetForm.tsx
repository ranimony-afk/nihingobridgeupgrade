"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function ResetForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function submit() {
    const response = await fetch("/api/v1/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", token: params.get("token"), password }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Password updated. You can sign in." : (data.error ?? "Failed"));
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-black">Choose a new password</h1>
        <input className="mt-5 w-full rounded-2xl border-2 px-3 py-2 font-bold" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="press mt-4 w-full bg-[#58cc02] py-3 text-white" onClick={submit} type="button">
          Update password
        </button>
        {note ? <p className="mt-3 font-bold">{note}</p> : null}
      </section>
    </main>
  );
}
