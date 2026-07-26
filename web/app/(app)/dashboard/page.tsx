import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, TriangleAlert } from "lucide-react";
import {
  getByModel,
  getOverview,
  getTimeSeries,
  listClusters,
  listRuns,
  listScores,
} from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Card, Chip, Page, PageHeader } from "@/components/page";
import {
  BarRows,
  ChartFrame,
  Histogram,
  StatStrip,
  StatTile,
  TimeSeries,
} from "@/components/charts";
import { MiniRibbon } from "@/components/viz";
import { STATUS_TEXT, fmtDuration, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const t = await getT();
  const [overview, clusters, runs, ts, byModel, scores] = await Promise.all([
    getOverview(),
    listClusters(),
    listRuns(),
    getTimeSeries(14),
    getByModel(),
    listScores(),
  ]);

  const labels = ts.cost.points.map((point) => point.t.slice(5));
  const val = (key: string) => ts.cost.points.map((point) => point.values[key] ?? 0);
  const totalCost = runs.reduce((sum, run) => sum + run.costUsd, 0);
  const problemRuns = runs.filter((run) => run.status !== "ok");
  const troubled = problemRuns.slice(0, 6);
  const efficiency = scores.filter((score) => score.name === "efficiency" && score.value !== null);
  const bins = Array.from({ length: 10 }, (_, index) => ({
    label: `${(index / 10).toFixed(1)}`,
    count: efficiency.filter(
      (score) => Math.min(9, Math.floor((score.value ?? 0) * 10)) === index,
    ).length,
  }));

  return (
    <Page>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subline", {
          runs: overview.runs24h,
          errorRuns: overview.errorRuns,
          wastedPct: overview.wastedPct,
        })}
        actions={
          <Link
            href="/docs#quickstart"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-fg-2 transition-colors hover:border-line-3 hover:text-fg focus-visible:ring-2"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            {t("dashboard.openQuickstart")}
          </Link>
        }
      />

      <div className="pb-7">
        <StatStrip>
          <StatTile
            label={t("dashboard.accuracy")}
            value={`${overview.accuracy}%`}
            delta={overview.accuracyDelta}
            deltaGoodWhen="up"
            spark={overview.accuracyTrend}
          />
          <StatTile
            label={t("dashboard.totalTraces")}
            value={String(runs.length)}
            spark={val("volume")}
          />
          <StatTile
            label={t("dashboard.errorRate")}
            value={`${runs.length ? Math.round((problemRuns.length / runs.length) * 100) : 0}%`}
          />
          <StatTile
            label={t("dashboard.totalCost")}
            value={fmtUsd(totalCost)}
              spark={val("cost")}
            />
        </StatStrip>
      </div>

      <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <div className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold tracking-tight">
              {t("dashboard.needsAttention")}
            </h2>
            <Link
              href="/traces"
              className="flex min-h-11 items-center gap-1 px-2 text-sm text-fg-2 transition-colors hover:text-fg focus-visible:ring-2"
            >
              {t("common.viewAll")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {troubled.length === 0 ? (
            <Card className="flex min-h-40 items-center justify-center text-sm text-fg-3">
              {t("common.noData")}
            </Card>
          ) : (
            <ul className="flex min-w-0 flex-col gap-1.5">
              {troubled.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/traces/${run.id}`}
                    className="flex min-h-20 min-w-0 items-center gap-3 rounded-md border border-hair px-3 py-3.5 transition-colors hover:border-line-2 hover:bg-hover focus-visible:ring-2 sm:gap-5 sm:px-4"
                  >
                    <TriangleAlert
                      className={cn(
                        "h-4 w-4 shrink-0",
                        run.status === "failed" ? "text-crit" : "text-warn",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">
                        {run.title}
                        <span className="text-fg-2">{run.titleTail}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-2.5 text-xs text-fg-3">
                        <span className="font-mono">{run.agent}</span>
                        <span>{relTime(run.startedAt)}</span>
                        <span>{fmtDuration(run.durationMs)}</span>
                        <span className={STATUS_TEXT[run.status]}>
                          {t(`status.${run.status}`)}
                        </span>
                      </p>
                    </div>
                    <div className="hidden w-36 shrink-0 sm:block">
                      <MiniRibbon turns={run.turns} />
                    </div>
                    <p
                      className={cn(
                        "w-14 shrink-0 text-right text-lg font-semibold tabular-nums",
                        run.score.accuracy < 70 ? "text-crit" : "text-fg",
                      )}
                    >
                      {run.score.accuracy}%
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card>
          <h2 className="text-sm font-semibold">{t("dashboard.topFailures")}</h2>
          <ul className="mt-4 divide-y divide-hair">
            {clusters.slice(0, 4).map((cluster, index) => (
              <li key={cluster.kind} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(`note.${cluster.kind}`)}</p>
                    <p className="mt-1 text-xs text-fg-3">
                      {t("units.runCount", { n: cluster.runCount })} ·{" "}
                      {fmtUsd(cluster.wastedUsd)}
                    </p>
                  </div>
                  {index === 0 && <Chip tone="crit">{t("failures.topPriority")}</Chip>}
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/failures"
            className="mt-5 inline-flex min-h-11 items-center gap-1 text-sm text-fg-2 hover:text-fg focus-visible:ring-2"
          >
            {t("common.showMore")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Card>
      </section>

      <details className="group mt-10 rounded-lg border border-line bg-ink-800">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-5 py-4 focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("dashboard.metricsDisclosure")}</h2>
            <p className="mt-1 text-sm text-fg-3">{t("dashboard.metricsDisclosureHint")}</p>
          </div>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line p-3 lg:grid-cols-2">
          <ChartFrame
            title={t("dashboard.costTrend")}
            series={[{ key: "cost", label: t("dashboard.cost"), values: val("cost") }]}
            labels={labels}
            formatValue="usd"
          >
            <TimeSeries
              series={[{ key: "cost", label: t("dashboard.cost"), values: val("cost") }]}
              labels={labels}
              area
              format="usd"
            />
          </ChartFrame>
          <ChartFrame
            title={t("dashboard.latencyTrend")}
            series={[
              { key: "p50", label: t("dashboard.p50"), values: val("p50") },
              { key: "p95", label: t("dashboard.p95"), values: val("p95") },
              { key: "p99", label: t("dashboard.p99"), values: val("p99") },
            ]}
            labels={labels}
            formatValue="duration"
          >
            <TimeSeries
              series={[
                { key: "p50", label: t("dashboard.p50"), values: val("p50") },
                { key: "p95", label: t("dashboard.p95"), values: val("p95") },
                { key: "p99", label: t("dashboard.p99"), values: val("p99") },
              ]}
              labels={labels}
              format="duration"
            />
          </ChartFrame>
          <ChartFrame title={t("dashboard.byModel")}>
            <BarRows
              rows={byModel.map((model) => ({
                label: model.label,
                value: model.tokens,
                note: `${t("units.traceCount", { n: model.traces })} · ${fmtUsd(model.cost)}`,
              }))}
              format="tokens"
              colorByIndex
            />
          </ChartFrame>
          <ChartFrame
            title={t("dashboard.scoreDistribution")}
            hint={t("evaluators.deterministicNote")}
          >
            <Histogram bins={bins} colorIndex={3} />
          </ChartFrame>
        </div>
      </details>
    </Page>
  );
}
