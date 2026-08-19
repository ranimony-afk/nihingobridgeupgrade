"use client";

import { useRef, useState } from "react";
import { speakJapanese } from "@/lib/speech";

type Turn = { role: "user" | "assistant"; text: string };
type Analysis = {
  score: number;
  corrections: { wrong: string; right: string; why: string }[];
  grammar: { id: string; title: string }[];
  vocabulary: { id: string; lemma: string }[];
};

const SCENARIOS = [
  { id: "cafe", label: "Cafe order" },
  { id: "station", label: "Station directions" },
  { id: "class", label: "Classroom" },
  { id: "interview", label: "Job interview" },
];

export function TutorLab({ provider }: { provider: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scenario, setScenario] = useState("cafe");
  const [level, setLevel] = useState("N5");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [shadow, setShadow] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef("");

  async function start() {
    const response = await fetch("/api/v1/tutor/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, level }),
    });
    const data = (await response.json()) as { data?: { id: string } };
    setSessionId(data.data?.id ?? null);
    setTurns([]);
    setAnalysis(null);
  }

  async function send() {
    if (!sessionId || !text.trim() || busy) return;
    const mine = text.trim();
    setTurns((list) => [...list, { role: "user", text: mine }]);
    setText("");
    setBusy(true);
    streamRef.current = "";
    setTurns((list) => [...list, { role: "assistant", text: "" }]);

    const response = await fetch("/api/v1/tutor/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text: mine }),
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
        if (eventLine?.includes("analysis")) {
          setAnalysis(payload as unknown as Analysis);
        }
        if (eventLine?.includes("token")) {
          streamRef.current += String(payload.text ?? "");
          const snapshot = streamRef.current;
          setTurns((list) => {
            const copy = [...list];
            copy[copy.length - 1] = { role: "assistant", text: snapshot };
            return copy;
          });
        }
        if (eventLine?.includes("done")) {
          const reply = String(payload.reply ?? streamRef.current);
          const spoken = reply.split("\n")[0] ?? reply;
          speakJapanese(spoken);
        }
      }
    }
    setBusy(false);
  }

  async function checkShadow() {
    const target = turns.filter((row) => row.role === "assistant").at(-1)?.text.split("\n")[0] ?? "";
    const heard = window.prompt("Type what you said (or paste speech-to-text):", target.slice(0, 12)) ?? "";
    const response = await fetch("/api/v1/tutor/shadow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, heard }),
    });
    const data = (await response.json()) as { data?: { score: number; verdict: string } };
    setShadow(data.data ? `${data.data.score}% · ${data.data.verdict}` : "No score");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
      <section className="card p-5">
        <div className="flex flex-wrap gap-2">
          <select value={scenario} onChange={(event) => setScenario(event.target.value)} className="rounded-2xl border-2 px-3 py-2 font-bold">
            {SCENARIOS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <select value={level} onChange={(event) => setLevel(event.target.value)} className="rounded-2xl border-2 px-3 py-2 font-bold">
            {["N5", "N4", "N3", "N2", "N1"].map((row) => (
              <option key={row}>{row}</option>
            ))}
          </select>
          <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" onClick={start}>
            {sessionId ? "Restart" : "Start roleplay"}
          </button>
          <span className="self-center text-xs font-bold text-[#777]">provider: {provider}</span>
        </div>

        <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto">
          {turns.map((turn, index) => (
            <div key={index} className={turn.role === "user" ? "text-right" : ""}>
              <p
                className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2 ${
                  turn.role === "user" ? "bg-[#ddf4ff] text-[#1cb0f6]" : "bg-[#f7f7f7]"
                }`}
              >
                {turn.text || "…"}
              </p>
            </div>
          ))}
          {!sessionId ? <p className="text-[#777]">Pick a scenario and press start.</p> : null}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void send();
            }}
            placeholder="日本語で書いてください"
            className="flex-1 rounded-2xl border-2 px-3 py-2 font-bold"
            disabled={!sessionId}
          />
          <button type="button" className="press bg-[#1cb0f6] px-4 text-white" onClick={send} disabled={!sessionId || busy}>
            Send
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" className="press bg-white px-3 py-1 text-sm" onClick={checkShadow} disabled={!turns.length}>
            🎤 Shadow & score
          </button>
          {shadow ? <span className="self-center text-sm font-bold">{shadow}</span> : null}
        </div>
      </section>

      <aside className="card p-5">
        <h2 className="text-lg font-black">Live analysis</h2>
        {!analysis ? <p className="text-sm text-[#777]">Send a line to see scoring.</p> : null}
        {analysis ? (
          <div className="mt-2 space-y-3 text-sm">
            <p className="text-3xl font-black text-[#58cc02]">{analysis.score}</p>
            {analysis.corrections.length ? (
              <div>
                <p className="font-black text-[#ff4b4b]">Corrections</p>
                {analysis.corrections.map((row) => (
                  <p key={row.wrong}>
                    {row.wrong} → <strong>{row.right}</strong> · {row.why}
                  </p>
                ))}
              </div>
            ) : (
              <p className="font-bold text-[#58a700]">No mistakes detected.</p>
            )}
            <div>
              <p className="font-black">Grammar detected</p>
              <p>{analysis.grammar.map((row) => row.title).join(" · ") || "—"}</p>
            </div>
            <div>
              <p className="font-black">Vocabulary detected</p>
              <p>{analysis.vocabulary.map((row) => row.lemma).join(" · ") || "—"}</p>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
