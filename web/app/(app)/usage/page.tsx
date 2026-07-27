import { getUsage } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader } from "@/components/page";
import {
  BarRows,
  ChartFrame,
  StatStrip,
  StatTile,
  TimeSeries,
} from "@/components/charts";
import { EXECUTE_HINTS } from "@/lib/usage";
import { brandForModel, brandForSource } from "@/lib/brand";
import { fmtTokens, fmtUsd, fmtDuration } from "@/lib/verdict";
import type { MessageKey } from "@/lib/i18n/shared";

/**
 * 사용량 — "내 코드 에이전트가 토큰을 어디에 썼나".
 *
 * 축이 넷이다. 하나로 합치면 답이 안 나온다:
 *   합계     전부 얼마인가
 *   에이전트 누가 썼나 (claude-code · codex · sdk · 개별 에이전트)
 *   작업     무엇을 하는 데 썼나 (쓰기·읽기·실행·위임·대화)
 *   도구     어느 호출이 비쌌나
 *
 * 작업 분류는 도구 이름으로 결정론적으로 한다. 규칙을 화면 아래에 그대로 적는다 —
 * 분류가 보이는데 규칙이 안 보이면 그건 또 하나의 못 믿을 숫자다.
 */
export default async function UsagePage() {
  const t = await getT();
  const usage = await getUsage(30);

  const labels = usage.daily.map((d) => d.day.slice(5));
  const series = usage.sources.map((src) => ({
    key: src,
    label: src,
    values: usage.daily.map((d) => d.bySource[src] ?? 0),
  }));

  const workLabel = (key: string) => t(`work.${key}` as MessageKey);
  // 런 합계와 턴 합계가 다를 수 있다. 그 차이를 숨기지 않는다.
  const drift = usage.total.tokens - usage.turnTokens;

  return (
    <Page>
      <PageHeader
        title={t("usage.title")}
        subtitle={t("usage.subtitle", {
          runs: usage.total.runs,
          agents: usage.byAgent.length,
        })}
      />

      <div className="pb-7">
        <StatStrip>
          <StatTile label={t("usage.totalTokens")} value={fmtTokens(usage.total.tokens)} />
          <StatTile label={t("usage.totalCost")} value={fmtUsd(usage.total.costUsd)} />
          <StatTile
            label={t("usage.agentTime")}
            value={fmtDuration(usage.total.durationMs, t)}
          />
          <StatTile
            label={t("usage.mostlyDoing")}
            value={usage.dominant ? workLabel(usage.dominant) : "—"}
          />
        </StatStrip>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartFrame
          title={t("usage.overTime")}
          hint={t("usage.overTimeHint")}
          series={series}
          labels={labels}
          formatValue="tokens"
          className="lg:col-span-2"
        >
          <TimeSeries series={series} labels={labels} format="tokens" area />
        </ChartFrame>

        <ChartFrame title={t("usage.bySource")} hint={t("usage.bySourceHint")}>
          <BarRows
            rows={usage.bySource.map((b) => ({
              label: b.key,
              brand: brandForSource(b.key),
              value: b.tokens,
              note: t("usage.runNote", { runs: b.runs, cost: fmtUsd(b.costUsd) }),
            }))}
            format="tokens"
            colorByIndex
          />
        </ChartFrame>

        <ChartFrame title={t("usage.byWork")} hint={t("usage.byWorkHint")}>
          <BarRows
            rows={usage.byWorkKind.map((b) => ({
              label: workLabel(b.key),
              value: b.tokens,
              note: t("usage.obsNote", { obs: b.observations, runs: b.runs }),
            }))}
            format="tokens"
            colorByIndex
          />
        </ChartFrame>

        <ChartFrame title={t("usage.byAgent")} hint={t("usage.byAgentHint")}>
          <BarRows
            rows={usage.byAgent.slice(0, 10).map((b) => ({
              label: b.key,
              value: b.tokens,
              note: t("usage.runNote", { runs: b.runs, cost: fmtUsd(b.costUsd) }),
            }))}
            format="tokens"
          />
        </ChartFrame>

        <ChartFrame title={t("usage.byTool")} hint={t("usage.byToolHint")}>
          <BarRows
            rows={usage.byTool.slice(0, 12).map((b) => ({
              label: b.key,
              value: b.tokens,
              note: t("usage.obsNote", { obs: b.observations, runs: b.runs }),
            }))}
            format="tokens"
          />
        </ChartFrame>

        <ChartFrame title={t("usage.byModel")} hint={t("usage.byModelHint")}>
          <BarRows
            rows={usage.byModel.map((b) => ({
              label: b.key,
              brand: brandForModel(b.key),
              value: b.tokens,
              note: t("usage.runNote", { runs: b.runs, cost: fmtUsd(b.costUsd) }),
            }))}
            format="tokens"
          />
        </ChartFrame>

        <ChartFrame title={t("usage.byProject")} hint={t("usage.byProjectHint")}>
          <BarRows
            rows={usage.byProject.map((b) => ({
              label: b.key,
              value: b.tokens,
              note: t("usage.runNote", { runs: b.runs, cost: fmtUsd(b.costUsd) }),
            }))}
            format="tokens"
          />
        </ChartFrame>
      </div>

      {/* 규칙을 그대로 적는다. 분류가 보이는데 규칙이 안 보이면 못 믿을 숫자가 된다. */}
      <section className="mt-7 border-t border-hair pt-5">
        <h2 className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
          {t("usage.ruleTitle")}
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-2">
          {t("usage.ruleBody")}
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {[
            ["read", "usage.ruleRead"],
            ["write", "usage.ruleWrite"],
            ["execute", "usage.ruleExecute"],
            ["delegate", "usage.ruleDelegate"],
            ["converse", "usage.ruleConverse"],
            ["other", "usage.ruleOther"],
          ].map(([kind, key]) => (
            <div key={kind} className="flex items-baseline gap-2 border-b border-hair py-1">
              <dt className="w-16 shrink-0 font-medium text-fg-2">{workLabel(kind)}</dt>
              <dd className="min-w-0 font-mono text-[11px] text-fg-3">
                {t(key as MessageKey)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 font-mono text-[11px] text-fg-3">
          {t("usage.ruleExecuteHints")} {EXECUTE_HINTS.join(" · ")}
        </p>

        {drift !== 0 && (
          <p className="mt-4 max-w-3xl border-l-2 border-line-2 pl-4 text-xs leading-relaxed text-fg-3">
            {t("usage.driftNote", {
              run: fmtTokens(usage.total.tokens),
              turn: fmtTokens(usage.turnTokens),
            })}
          </p>
        )}
      </section>
    </Page>
  );
}
