"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  SyncDevice,
  SyncLogEntry,
  SyncPullResult,
  SyncPushResult,
  SyncRegistryStatus,
  SyncReviewEvent,
} from "@/types/srs";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  Copy,
  Cpu,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";

interface StatusShape {
  registry: SyncRegistryStatus;
  devices: SyncDevice[];
  recentLog: SyncLogEntry[];
  totals: {
    devices: number;
    activeDevices: number;
    reviewsSynced: number;
    conflictsResolved: number;
    duplicatesBlocked: number;
  };
  serverTime: string;
}

const PLATFORM_ICON: Record<string, typeof Monitor> = {
  web: Monitor,
  ios: Smartphone,
  android: Smartphone,
  desktop: Tablet,
};

/** Simple localStorage-backed device identity, mirroring what a mobile app would do. */
function getOrCreateDeviceId(): { deviceId: string; name: string } {
  if (typeof window === "undefined") return { deviceId: "ssr", name: "Server" };
  const KEY = "nihongobridge.deviceId";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `web-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, id);
  }
  return { deviceId: id, name: `Web · ${id.slice(-6)}` };
}

export default function SyncPage() {
  const [status, setStatus] = useState<StatusShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [pullResult, setPullResult] = useState<SyncPullResult | null>(null);
  const [pushResult, setPushResult] = useState<SyncPushResult | null>(null);

  const deviceId = getOrCreateDeviceId();

  const say = (line: string) =>
    setLog((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString("en-US", { hour12: false })}  ${line}`]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/srs/sync");
      const json = await res.json();
      if (json.success) setStatus(json);
    } catch (e) {
      console.error("Failed to load sync status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    setBusy("register");
    try {
      const res = await fetch("/api/srs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: deviceId.deviceId,
          name: deviceId.name,
          platform: "web",
          appVersion: "1.0.0",
        }),
      });
      const json = await res.json();
      say(json.success ? `${json.created ? "registered" : "re-registered"} ${deviceId.deviceId}` : `error: ${json.error}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  /** Simulate an offline device: collect events locally without telling the server. */
  const offlineQueue = async () => {
    setBusy("queue");
    try {
      const res = await fetch("/api/srs/queue?limit=2");
      const json = await res.json();
      if (!json.success || json.queue.length === 0) {
        say("no due cards available to stage");
        return;
      }
      const events: SyncReviewEvent[] = json.queue.map(
        (c: { id: string; state: { totalReviews: number; repetitions: number; intervalDays: number } }) => ({
          clientId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          cardId: c.id,
          rating: "good" as const,
          reviewedAt: new Date().toISOString(),
          timeSpentMs: 2400,
          stateBefore: {
            repetitions: c.state.repetitions,
            intervalDays: c.state.intervalDays,
            totalReviews: c.state.totalReviews,
          },
        })
      );
      window.sessionStorage.setItem("nb.offlineQueue", JSON.stringify(events));
      say(`staged ${events.length} review event(s) locally (offline)`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const readQueue = (): SyncReviewEvent[] => {
    if (typeof window === "undefined") return [];
    const raw = window.sessionStorage.getItem("nb.offlineQueue");
    return raw ? (JSON.parse(raw) as SyncReviewEvent[]) : [];
  };

  const push = async () => {
    const events = readQueue();
    if (events.length === 0) {
      say("offline queue is empty — stage some events first");
      return;
    }
    setBusy("push");
    try {
      say(`pushing ${events.length} event(s) from ${deviceId.deviceId}…`);
      const res = await fetch("/api/srs/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: deviceId.deviceId,
          deviceName: deviceId.name,
          platform: "web",
          appVersion: "1.0.0",
          events,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const r: SyncPushResult = json.result;
      setPushResult(r);
      window.sessionStorage.removeItem("nb.offlineQueue");
      say(
        `push complete: ${r.accepted} accepted, ${r.duplicatesSkipped} duplicate(s) blocked, ${r.conflictsResolved} conflict(s) resolved`
      );
      await load();
    } catch (e) {
      say(`push failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  /** Deliberately re-push the SAME events to prove idempotency. */
  const pushAgain = async () => {
    const events = readQueue();
    if (events.length === 0) {
      say("queue already cleared — nothing to replay");
      return;
    }
    setBusy("push");
    try {
      const res = await fetch("/api/srs/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId.deviceId, events }),
      });
      const json = await res.json();
      const r: SyncPushResult = json.result;
      say(
        `replay: ${r.accepted} accepted, ${r.duplicatesSkipped} duplicate(s) blocked ${
          r.accepted === 0 ? "→ idempotency CONFIRMED" : "→ WARNING: double-apply!"
        }`
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  const pull = async (snapshot: boolean) => {
    setBusy(snapshot ? "snapshot" : "pull");
    try {
      const cursor = snapshot ? null : pullResult?.nextCursor ?? null;
      const url = `/api/srs/sync/pull?deviceId=${deviceId.deviceId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : "&snapshot=1"}&limit=25`;
      say(`${snapshot ? "full snapshot" : "delta pull"}${cursor ? " since cursor" : ""}…`);
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const r: SyncPullResult = json.result;
      setPullResult(r);
      say(
        `received ${r.counts.cards} card(s), ${r.counts.reviews} review(s), ${r.counts.decks} deck(s)${
          r.hasMore ? " (more available)" : ""
        } · registry ${r.registry.fingerprint}${r.registry.deviceIsStale ? " STALE" : ""}`
      );
      await load();
    } catch (e) {
      say(`pull failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const staged = typeof window !== "undefined" ? readQueue().length : 0;

  if (loading || !status) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Loading synchronization layer…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Phase 11 · Prompt 11.4
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Synchronization
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              同期 — SRS Synchronization
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Event-based replay sync · idempotent pushes · deterministic conflict resolution
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/review"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={load}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Devices", value: status.totals.activeDevices, icon: Monitor, tone: "text-indigo-600 bg-indigo-50" },
            { label: "Reviews synced", value: status.totals.reviewsSynced, icon: Upload, tone: "text-emerald-600 bg-emerald-50" },
            { label: "Conflicts resolved", value: status.totals.conflictsResolved, icon: Waves, tone: "text-amber-600 bg-amber-50" },
            { label: "Duplicates blocked", value: status.totals.duplicatesBlocked, icon: Copy, tone: "text-sky-600 bg-sky-50" },
            { label: "Registry", value: status.registry.pluginCount, icon: Cpu, tone: "text-violet-600 bg-violet-50" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${s.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-black text-slate-900">{s.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Registry fingerprint */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-violet-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Scheduler Registry Fingerprint</h3>
                <p className="text-[11px] text-slate-500">
                  Devices compare this to detect that their local algorithm code is out of date.
                </p>
              </div>
            </div>
            <code className="rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300">
              {status.registry.fingerprint}
            </code>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {status.registry.schedulerKeys.map((k) => (
              <span key={k} className="rounded bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700 ring-1 ring-violet-100">
                {k}@{status.registry.versions[k]}
              </span>
            ))}
          </div>
        </div>

        {/* Two-column: sync console + devices */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Sync console */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <CloudOff className="h-5 w-5 text-slate-600" />
              <h3 className="text-base font-bold text-slate-900">Sync Console</h3>
              <span className="text-[10px] text-slate-400">simulates an offline-capable client</span>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">This device</span>
                <code className="font-mono text-[10px] text-slate-500">{deviceId.deviceId}</code>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Staged offline events:{" "}
                <strong className={staged > 0 ? "text-amber-700" : "text-slate-400"}>{staged}</strong>
                {staged > 0 && <span className="ml-2 text-amber-600">(not yet sent to server)</span>}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                onClick={register}
                disabled={busy !== null}
                className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                1 · Register
              </button>
              <button
                onClick={offlineQueue}
                disabled={busy !== null}
                className="rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                2 · Stage offline
              </button>
              <button
                onClick={push}
                disabled={busy !== null || staged === 0}
                className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                3 · Push {staged > 0 ? `(${staged})` : ""}
              </button>
              <button
                onClick={pushAgain}
                disabled={busy !== null || staged === 0}
                className="rounded-xl border-2 border-sky-300 bg-sky-50 py-2.5 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-40"
              >
                4 · Re-push (idempotency)
              </button>
              <button
                onClick={() => pull(true)}
                disabled={busy !== null}
                className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                5 · Snapshot
              </button>
              <button
                onClick={() => pull(false)}
                disabled={busy !== null}
                className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                6 · Delta pull
              </button>
            </div>

            {/* Push result */}
            {pushResult && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Push result
                </h4>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-emerald-900">
                  <span>accepted <strong>{pushResult.accepted}</strong></span>
                  <span>duplicates <strong>{pushResult.duplicatesSkipped}</strong></span>
                  <span>conflicts <strong>{pushResult.conflictsResolved}</strong></span>
                  <span>cards <strong>{pushResult.cardsTouched}</strong></span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {pushResult.perCard.map((p) => (
                    <div key={p.cardId} className="rounded-lg bg-white/80 p-2.5 text-[10px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.conflict && (
                          <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-900">CONFLICT</span>
                        )}
                        <span className="font-japanese font-bold text-slate-900">{p.front}</span>
                        <span className="text-slate-500">×{p.accepted} accepted</span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-indigo-700">→ {p.finalIntervalLabel}</span>
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-white">
                          {p.schedulerKey}@{p.schedulerVersion}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">{p.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pull result */}
            {pullResult && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-900 p-4">
                <h4 className="text-xs font-bold text-slate-200">Pull envelope</h4>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                  {[
                    ["cursor requested", pullResult.cursorRequested ? "yes" : "initial"],
                    ["cards", pullResult.counts.cards],
                    ["reviews", pullResult.counts.reviews],
                    ["decks", pullResult.counts.decks],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-lg bg-white/5 p-2">
                      <div className="text-slate-400">{k}</div>
                      <div className="font-mono text-sm font-bold text-emerald-300">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  next cursor: <code className="text-emerald-300">{pullResult.nextCursor}</code>
                  {pullResult.hasMore && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">hasMore</span>}
                </div>
                {pullResult.cards.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-black/30 p-2">
                    {pullResult.cards.slice(0, 6).map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-0.5 text-[10px]">
                        <span className="font-japanese text-slate-200">{c.front}</span>
                        <span className="font-mono text-slate-400">
                          {c.state.totalReviews}rev · {c.schedulerKey}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Live log */}
            <div className="mt-4 rounded-2xl bg-slate-900 p-4">
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Console</h4>
              {log.length === 0 ? (
                <p className="text-[11px] text-slate-500">Run a step above to see the sync protocol in action.</p>
              ) : (
                <div className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-relaxed">
                  {log.map((l, i) => (
                    <div key={i} className="text-emerald-300">{l}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Devices */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Monitor className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Devices</h3>
            </div>

            {status.devices.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No devices registered. Click <strong>Register</strong> to enrol this browser.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {status.devices.map((d) => {
                  const Icon = PLATFORM_ICON[d.platform] ?? Monitor;
                  const isThis = d.deviceId === deviceId.deviceId;
                  return (
                    <div
                      key={d.id}
                      className={`rounded-2xl border-2 p-3.5 ${
                        d.isRevoked
                          ? "border-slate-200 bg-slate-50 opacity-60"
                          : isThis
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                            <Icon className="h-4 w-4 text-slate-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900">{d.name}</span>
                              {isThis && (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  THIS
                                </span>
                              )}
                            </div>
                            <code className="font-mono text-[9px] text-slate-400">{d.deviceId}</code>
                          </div>
                        </div>
                        {!d.isRevoked && (
                          <button
                            onClick={async () => {
                              await fetch(`/api/srs/sync?deviceId=${d.deviceId}`, { method: "DELETE" });
                              say(`revoked ${d.deviceId}`);
                              await load();
                            }}
                            title="Revoke device"
                            className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-2.5 space-y-0.5 text-[10px] text-slate-500">
                        <div className="flex justify-between">
                          <span>Platform</span>
                          <strong className="text-slate-700">{d.platform} · {d.appVersion}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Last push</span>
                          <strong className="text-slate-700">
                            {d.lastPushedAt ? new Date(d.lastPushedAt).toLocaleTimeString("en-US", { hour12: false }) : "never"}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Last pull</span>
                          <strong className="text-slate-700">
                            {d.lastPulledAt ? new Date(d.lastPulledAt).toLocaleTimeString("en-US", { hour12: false }) : "never"}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span>Registry</span>
                          {d.lastRegistryFingerprint ? (
                            status.registry.fingerprint === d.lastRegistryFingerprint ? (
                              <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-2.5 w-2.5" /> current
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                <AlertTriangle className="h-2.5 w-2.5" /> stale
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">unknown</span>
                          )}
                        </div>
                      </div>

                      {d.isRevoked && (
                        <div className="mt-2 rounded-lg bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700">
                          Revoked — sync blocked
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Server sync log */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
            <Waves className="h-5 w-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">Server Sync Log</h3>
            <span className="text-[10px] text-slate-400">append-only audit · every operation records its cursor</span>
          </div>

          {status.recentLog.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">No sync operations recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {status.recentLog.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        l.operation === "push"
                          ? "bg-emerald-100 text-emerald-700"
                          : l.operation === "pull"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {l.operation}
                    </span>
                    <code className="font-mono text-[9px] text-slate-400">{l.deviceId}</code>
                    <span className="text-[10px] text-slate-600">{l.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {l.accepted > 0 && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                        +{l.accepted}
                      </span>
                    )}
                    {l.duplicatesSkipped > 0 && (
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">
                        dup {l.duplicatesSkipped}
                      </span>
                    )}
                    {l.conflictsResolved > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        conflict {l.conflictsResolved}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-400">
                      {new Date(l.createdAt).toLocaleTimeString("en-US", { hour12: false })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
