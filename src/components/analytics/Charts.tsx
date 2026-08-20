import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  tone = "#1cb0f6",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-black" style={{ color: tone }}>
        {value}
      </p>
      {hint ? <p className="text-xs text-white/50">{hint}</p> : null}
    </article>
  );
}

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 p-5">
      <h2 className="text-xl font-black">{title}</h2>
      {subtitle ? <p className="text-xs text-white/50">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Area sparkline. Renders a flat baseline rather than NaN when all values are 0. */
export function Sparkline({
  values,
  labels,
  color = "#58cc02",
  height = 90,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
}) {
  if (values.length === 0) return <p className="text-sm text-white/50">No data yet.</p>;
  const width = 600;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend chart">
        <polygon points={area} fill={color} opacity="0.18" />
        <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
      </svg>
      {labels ? (
        <div className="flex justify-between text-[10px] text-white/40">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
      <p className="mt-1 text-xs text-white/50">peak {max.toLocaleString()}</p>
    </div>
  );
}

export function FunnelChart({
  steps,
}: {
  steps: { key: string; label: string; count: number; stepRate: number; overallRate: number; dropOff: number }[];
}) {
  const top = steps[0]?.count ?? 0;
  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const width = top > 0 ? Math.max(4, (step.count / top) * 100) : 4;
        return (
          <div key={step.key}>
            <div className="flex justify-between text-xs">
              <span className="font-bold">{step.label}</span>
              <span className="text-white/60">
                {step.count.toLocaleString()} · {(step.overallRate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-7 w-full overflow-hidden rounded-lg bg-white/5">
              <div
                className="flex h-full items-center justify-end rounded-lg pr-2 text-[10px] font-black text-[#04210a]"
                style={{ width: `${width}%`, background: "linear-gradient(90deg,#89e219,#58cc02)" }}
              >
                {step.count > 0 ? step.count.toLocaleString() : ""}
              </div>
            </div>
            {index > 0 && step.dropOff > 0 ? (
              <p className="mt-0.5 text-[10px] text-[#ff9600]">
                −{step.dropOff.toLocaleString()} dropped ({(step.stepRate * 100).toFixed(0)}% carried through)
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Cohort heatmap. Colour intensity encodes retention rate. */
export function CohortGrid({
  cohorts,
  offsets,
}: {
  cohorts: { cohort: string; size: number; retention: { offset: number; count: number; rate: number }[] }[];
  offsets: number[];
}) {
  if (cohorts.length === 0) return <p className="text-sm text-white/50">No cohorts yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-white/50">
          <tr>
            <th className="px-2 py-1">Cohort</th>
            <th className="px-2 py-1">Size</th>
            {offsets.map((offset) => (
              <th key={offset} className="px-2 py-1">
                W{offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row) => (
            <tr key={row.cohort} className="border-t border-white/10">
              <td className="px-2 py-1 font-bold">{row.cohort}</td>
              <td className="px-2 py-1 text-white/60">{row.size}</td>
              {row.retention.map((cell) => (
                <td key={cell.offset} className="px-1 py-1">
                  <div
                    className="rounded px-2 py-1 text-center font-black"
                    style={{
                      background: cell.rate > 0 ? `rgba(88,204,2,${0.15 + cell.rate * 0.7})` : "rgba(255,255,255,0.04)",
                      color: cell.rate > 0.5 ? "#04210a" : "#e5e7eb",
                    }}
                  >
                    {cell.rate > 0 ? `${(cell.rate * 100).toFixed(0)}%` : "—"}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BarList({
  rows,
  unit = "",
}: {
  rows: { label: string; value: number; hint?: string }[];
  unit?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-white/50">No data yet.</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-xs">
            <span className="truncate pr-2 font-bold">{row.label}</span>
            <span className="shrink-0 text-white/60">
              {row.value.toLocaleString()}
              {unit}
              {row.hint ? ` · ${row.hint}` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-[#1cb0f6]"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
