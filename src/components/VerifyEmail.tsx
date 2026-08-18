"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function VerifyEmail() {
  const params = useSearchParams();
  const [note, setNote] = useState("Verifying…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setNote("Missing token");
      return;
    }
    void fetch("/api/v1/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token }),
    })
      .then((response) => response.json())
      .then((data: { ok?: boolean; error?: string }) => {
        setNote(data.ok ? "Email verified." : (data.error ?? "Could not verify"));
      });
  }, [params]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="card w-full max-w-md p-8 text-center">
        <h1 className="text-3xl font-black">Email verification</h1>
        <p className="mt-4 font-bold">{note}</p>
        <Link href="/account" className="mt-4 inline-block font-black text-[#1cb0f6]">
          Account
        </Link>
      </section>
    </main>
  );
}
