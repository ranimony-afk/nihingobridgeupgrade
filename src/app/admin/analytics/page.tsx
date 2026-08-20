import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { BarList, CohortGrid, FunnelChart, Panel, Sparkline, StatCard } from "@/components/analytics/Charts";
import { DemoSeedButton } from "@/components/analytics/DemoSeedButton";
import { getStaffSession } from "@/lib/audit/auth";
import { analyticsOverview } from "@/lib/analytics/service";
import { formatMoney } from "@/lib/billing/gst";
import { percent } from "@/lib/analytics/metrics";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const data = await analyticsOverview();
  const { learning, revenue, funnel, retention, product } = data;

  const trendLabel = learning.xpTrend === 0 ? "flat" : `${learning.xpTrend > 0 ? "+" : ""}${percent(Math.abs(learning.xpTrend) > 1 ? 1 : Math.abs(learning.xpTrend))}%`;

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Analytics</p>
      <h1 className="text-4xl font-black">Dashboard</h1>
      <p className="mt-2 text-sm text-white/60">
        Learning, business, retention, funnel, and revenue. Aggregated in SQL at request time.
      </p>
      <DemoSeedButton />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="DAU" value={learning.dau.toLocaleString()} hint={`WAU ${learning.wau} · MAU ${learning.mau}`} />
        <StatCard
          label="Stickiness"
          value={`${percent(learning.stickiness)}%`}
          hint="DAU / MAU"
          tone="#ce82ff"
        />
        <StatCard label="MRR" value={formatMoney(revenue.mrr, "usd")} hint={`ARR ${formatMoney(revenue.arr, "usd")}`} tone="#ffc800" />
        <StatCard
          label="Net revenue"
          value={formatMoney(revenue.netRevenue, "usd")}
          hint={`${revenue.paidInvoices} invoices · ${formatMoney(revenue.refunded, "usd")} refunded`}
          tone="#58cc02"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Learning activity" subtitle={`XP over 30 days · trend ${trendLabel}`}>
          <Sparkline
            values={learning.series.map((row) => row.xp)}
            labels={learning.series.map((row) => row.date)}
          />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Total XP</p>
              <p className="font-black">{learning.xpTotal.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Median / day</p>
              <p className="font-black">{learning.xpMedian.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Avg streak</p>
              <p className="font-black">{learning.avgStreak}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Acquisition funnel" subtitle="Each stage is a subset of the one above">
          <FunnelChart steps={funnel.steps} />
          {funnel.anomalies.length > 0 ? (
            <p className="mt-3 rounded-xl bg-[#ff4b4b]/15 px-3 py-2 text-xs text-[#ff8a8a]">
              Tracking issue: {funnel.anomalies.map((step) => step.label).join(", ")} reports more
              actors than the stage above. Stages must be subsets, so this is a measurement bug.
            </p>
          ) : null}
          {funnel.worst ? (
            <p className="mt-3 rounded-xl bg-[#ff9600]/15 px-3 py-2 text-xs text-[#ffc800]">
              Biggest drop at <strong>{funnel.worst.label}</strong> — only{" "}
              {(funnel.worst.stepRate * 100).toFixed(0)}% carried through.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Weekly retention cohorts"
          subtitle={`W0 is the joining week. Average week-1 return: ${percent(retention.averageWeek1)}%`}
        >
          <CohortGrid cohorts={retention.cohorts} offsets={retention.offsets} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Revenue" subtitle="Annual plans normalised to monthly for MRR">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="ARPU" value={formatMoney(revenue.arpu, "usd")} tone="#1cb0f6" />
            <StatCard label="LTV" value={formatMoney(revenue.ltv, "usd")} hint="capped at 36 months" tone="#58cc02" />
            <StatCard label="Churn" value={`${percent(revenue.churnRate)}%`} tone="#ff4b4b" />
            <StatCard label="Active subs" value={String(revenue.activeSubscriptions)} tone="#ffc800" />
          </div>
          <div className="mt-4">
            <BarList
              rows={revenue.byPlan.map((row) => ({
                label: row.name,
                value: row.subscribers,
                hint: formatMoney(row.mrr, "usd"),
              }))}
            />
          </div>
        </Panel>

        <Panel title="Product usage" subtitle="Tutor, search, and tracked events">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Tutor sessions</p>
              <p className="font-black">{product.tutor.sessions}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Searches</p>
              <p className="font-black">{product.search.searches}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[10px] uppercase text-white/50">Zero-result</p>
              <p className="font-black text-[#ff9600]">{percent(product.search.zeroRate)}%</p>
            </div>
          </div>
          <div className="mt-4">
            <BarList rows={product.events.map((row) => ({ label: row.name, value: row.count }))} />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Most completed lessons">
          <BarList
            rows={learning.topLessons.map((row) => ({
              label: row.title,
              value: row.completions,
              hint: `${row.accuracy}% acc`,
            }))}
          />
        </Panel>
        <Panel title="Lessons learners struggle with" subtitle="Average accuracy below 70%">
          {learning.strugglingLessons.length === 0 ? (
            <p className="text-sm text-white/50">No lesson is below the accuracy threshold.</p>
          ) : (
            <BarList
              rows={learning.strugglingLessons.map((row) => ({
                label: row.title,
                value: row.accuracy,
                hint: `${row.attempts} attempts`,
              }))}
              unit="%"
            />
          )}
        </Panel>
      </div>

      <p className="mt-6 text-xs text-white/40">Generated {data.generatedAt}</p>
    </AdminShell>
  );
}
