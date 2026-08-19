"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SessionRow = { id: string; userAgent: string | null; createdAt: string | Date };

export function AccountPanel({
  email,
  role,
  plan,
  verified,
  totpEnabled,
}: {
  email: string;
  role: string;
  plan: string;
  verified: boolean;
  totpEnabled: boolean;
}) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function loadSessions() {
    const response = await fetch("/api/v1/auth/sessions");
    const data = (await response.json()) as { data?: SessionRow[] };
    setSessions(data.data ?? []);
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function setup() {
    const response = await fetch("/api/v1/auth/two-factor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const data = (await response.json()) as { data?: { secret: string; otpauth: string } };
    setSecret(data.data?.secret ?? null);
    setNote(data.data?.otpauth ?? null);
  }

  async function enable() {
    const response = await fetch("/api/v1/auth/two-factor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: totpEnabled ? "disable" : "enable", code }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Updated 2FA" : (data.error ?? "Failed"));
    router.refresh();
  }

  async function revoke(id: string) {
    await fetch("/api/v1/auth/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadSessions();
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="card p-5">
        <p className="font-black">{email}</p>
        <p className="text-sm text-[#777]">
          {role} · {plan} · {verified ? "email verified" : "email unverified"}
        </p>
      </section>
      <section className="card p-5">
        <h2 className="text-xl font-black">Two-factor authentication</h2>
        <p className="text-sm text-[#777]">{totpEnabled ? "Enabled" : "Not enabled"}</p>
        <button className="press mt-3 bg-white px-4 py-2" onClick={setup} type="button">
          Generate TOTP secret
        </button>
        {secret ? <p className="mt-2 font-mono text-sm">{secret}</p> : null}
        <input className="mt-3 w-full rounded-2xl border-2 px-3 py-2 font-bold" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" />
        <button className="press mt-3 bg-[#1cb0f6] px-4 py-2 text-white" onClick={enable} type="button">
          {totpEnabled ? "Disable" : "Enable"}
        </button>
        {note ? <p className="mt-2 text-sm font-bold">{note}</p> : null}
      </section>
      <section className="card p-5">
        <h2 className="text-xl font-black">Sessions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3">
              <span>{session.userAgent ?? "client"}</span>
              <button className="press bg-white px-3 py-1" type="button" onClick={() => revoke(session.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
        <button className="press mt-4 bg-[#3c3c3c] px-4 py-2 text-white" onClick={logout} type="button">
          Sign out
        </button>
      </section>
    </div>
  );
}
