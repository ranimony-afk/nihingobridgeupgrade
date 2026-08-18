"use client";

import { FormEvent, useEffect, useState } from "react";

type SessionRecord = {
  id: string;
  current: boolean;
  expiresAt: string;
  createdAt: string;
  userAgent: string | null;
  ipAddress: string | null;
};

type Enrollment = {
  qrCodeDataUrl: string;
  manualKey: string;
};

export function SecurityCenter() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadSessions() {
    const response = await fetch("/api/v1/auth/sessions", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { sessions: SessionRecord[] };
    setSessions(body.sessions);
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function startEnrollment() {
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/auth/2fa/setup", { method: "POST" });
      const body = (await response.json()) as { enrollment?: Enrollment; error?: string };
      if (!response.ok || !body.enrollment) {
        setMessage(body.error ?? "We could not start two-factor enrollment.");
        return;
      }
      setEnrollment(body.enrollment);
      setRecoveryCodes([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/auth/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { recoveryCodes?: string[]; error?: string };
      if (!response.ok || !body.recoveryCodes) {
        setMessage(body.error ?? "The authenticator code could not be verified.");
        return;
      }
      setRecoveryCodes(body.recoveryCodes);
      setEnrollment(null);
      setCode("");
      setMessage("Two-factor authentication is active. Save your recovery codes now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function disableEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "The code could not be verified.");
        return;
      }
      setDisableCode("");
      setRecoveryCodes([]);
      setMessage("Two-factor authentication has been disabled.");
    } finally {
      setIsLoading(false);
    }
  }

  async function revokeSession(id: string) {
    const response = await fetch(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await loadSessions();
  }

  async function revokeOtherSessions() {
    const response = await fetch("/api/v1/auth/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exceptCurrent: true }),
    });
    if (response.ok) await loadSessions();
  }

  return (
    <div className="space-y-6">
      {message && <p role="status" className="rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}

      <section className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5">
        <p className="text-xs font-extrabold tracking-[0.14em] text-[#277a5c]">TWO-FACTOR AUTHENTICATION</p>
        <h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">Protect your account</h2>
        <p className="mt-2 text-sm leading-6 text-[#657166]">Use an authenticator app to add a second factor to password, OAuth, and magic-link sign-ins.</p>

        {!enrollment && recoveryCodes.length === 0 && <button type="button" disabled={isLoading} onClick={startEnrollment} className="mt-4 rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">Set up authenticator app</button>}

        {enrollment && <div className="mt-5 grid gap-5 rounded-xl bg-[#edf0e9] p-4 sm:grid-cols-[180px_1fr]">
          <img src={enrollment.qrCodeDataUrl} width={180} height={180} alt="Scan this QR code with your authenticator app" className="rounded-lg bg-white p-2" />
          <div>
            <p className="text-sm font-bold text-[#415247]">1. Scan the code</p>
            <p className="mt-1 text-xs leading-5 text-[#657166]">If you cannot scan it, enter this setup key manually: <code className="break-all rounded bg-white px-1.5 py-1 text-[#18231d]">{enrollment.manualKey}</code></p>
            <form onSubmit={confirmEnrollment} className="mt-4 flex gap-2">
              <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" autoComplete="one-time-code" className="min-w-0 flex-1 rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 outline-none ring-[#277a5c] focus:ring-2" />
              <button disabled={isLoading} className="rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">Confirm</button>
            </form>
          </div>
        </div>}

        {recoveryCodes.length > 0 && <div className="mt-5 rounded-xl border border-[#f0c66c] bg-[#fff4c9] p-4">
          <p className="text-sm font-extrabold text-[#6e5522]">Recovery codes — save these now</p>
          <p className="mt-1 text-xs leading-5 text-[#796333]">Each code works once. They will not be shown again.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-[#3c4227]">{recoveryCodes.map((recoveryCode) => <code className="rounded bg-white/70 px-2 py-1.5" key={recoveryCode}>{recoveryCode}</code>)}</div>
        </div>}

        <form onSubmit={disableEnrollment} className="mt-5 border-t border-[#dce3d8] pt-4">
          <label className="block text-sm font-bold text-[#415247]">Disable with an authenticator or recovery code
            <div className="mt-1.5 flex gap-2"><input value={disableCode} onChange={(event) => setDisableCode(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 outline-none ring-[#277a5c] focus:ring-2" autoComplete="one-time-code" /><button disabled={isLoading || !disableCode} className="rounded-xl border border-[#d46f61] px-4 py-2 text-sm font-bold text-[#a4463a] disabled:opacity-50">Disable</button></div>
          </label>
        </form>
      </section>

      <section className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold tracking-[0.14em] text-[#277a5c]">ACTIVE SESSIONS</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">Your signed-in devices</h2></div><button type="button" onClick={revokeOtherSessions} className="text-sm font-bold text-[#277a5c] underline">Sign out other devices</button></div>
        <div className="mt-4 divide-y divide-[#e1e6de]">{sessions.map((session) => <div className="flex items-center justify-between gap-4 py-3" key={session.id}><div><p className="text-sm font-bold text-[#415247]">{session.current ? "This device" : session.userAgent ?? "Unknown device"}</p><p className="mt-1 text-xs text-[#748076]">{session.ipAddress ?? "IP unavailable"} · Expires {new Date(session.expiresAt).toLocaleDateString()}</p></div>{!session.current && <button type="button" onClick={() => revokeSession(session.id)} className="text-sm font-bold text-[#a4463a] underline">Revoke</button>}</div>)}{sessions.length === 0 && <p className="py-4 text-sm text-[#657166]">No active browser sessions were found.</p>}</div>
      </section>
    </div>
  );
}
