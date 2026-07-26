import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { getRun, scoresForTrace, sumCounterfactuals } from "@/lib/data";
import { FAILURE_RULE } from "@/lib/types";
import { getT } from "@/lib/i18n";
import { Crumbs, Chip, Card } from "@/components/page";
import {
  EvidenceList,
  PhaseAccuracy,
  SavingsChips,
  Scorecard,
} from "@/components/viz";
import { ExecutionPath } from "@/components/execution-path";
import { Provenance } from "@/components/provenance";
import { AnalysisDemoNotice, AnalysisPanel } from "@/components/analysis-panel";
import { briefPreview, providerStatuses } from "@/lib/analysis/run";
import { isPublicSite } from "@/lib/deploy";
import {
  STATUS_TEXT,
  fmtDuration,
  fmtTokens,
  fmtUsd,
  relTime,
} from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function RunSummaryPage(props: PageProps<"/traces/[runId]">) {
  const { runId } = await props.params;
  const t = await getT();
  const run = await getRun(runId);
  if (!run) notFound();

  const flagged = run.turns.filter((x) => x.note);
  const saved = sumCounterfactuals(run.turns);
  const scores = await scoresForTrace(run.id);
  // 제공자 상태는 환경변수만 본다 (probe=false). ollama 를 여기서 물어보면
  // 떠 있지 않은 ollama 를 기다리느라 이 화면이 늦어진다 — 고를 때 물어본다.
  const [providers, briefs] = await Promise.all([providerStatuses(), briefPreview(run.id)]);
  // 공개 배포에서는 이 패널로 분석을 돌릴 수 없다. 어느 쪽을 그릴지는 서버가 정한다.
  const demo = isPublicSite();

  return (
    <div>
      <div className="mx-auto max-w-[1440px] px-4 pt-7 pb-6 sm:px-6 lg:px-8">
        <Crumbs
          items={[{ label: t("traces.title"), href: "/traces" }, { label: run.id }]}
        />

        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 max-w-3xl text-2xl font-semibold tracking-tight">
              {run.title}
              <span className="text-fg-2">{run.titleTail}</span>
            </h1>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip>{t("traces.turnCount", { n: run.turns.length })}</Chip>
              <Chip>{fmtDuration(run.durationMs, t)}</Chip>
              {/* 대기 시간은 지연에 섞지 않고 따로 말한다 — 섞으면 둘 다 거짓이 된다 */}
              {(run.idleMs ?? 0) > 60_000 && (
                <span
                  title={t("traces.idleNote")}
                  className="rounded-full border border-dashed border-line-2 px-2.5 py-0.5 text-xs font-medium text-fg-3"
                >
                  {t("traces.idleTime")} {fmtDuration(run.idleMs!, t)}
                </span>
              )}
              <Chip>{fmtTokens(run.totalTokens)}</Chip>
              <span title={run.costEstimated ? t("traces.estimatedCost") : undefined}>
                <Chip>
                  {run.costEstimated ? "≈" : ""}
                  {fmtUsd(run.costUsd)}
                </Chip>
              </span>
              {run.truncation && (
                <Chip tone="warn">
                  {t("traces.truncated", {
                    captured: run.truncation.captured,
                    available: run.truncation.available,
                  })}
                </Chip>
              )}
              {run.humanInterventions > 0 && (
                <Chip>{t("traces.humanCount", { n: run.humanInterventions })}</Chip>
              )}
              <Chip>{run.model}</Chip>
              <Chip>{relTime(run.startedAt, t)}</Chip>
              <span
                className={cn(
                  "rounded-full border border-line px-2.5 py-0.5 text-xs font-medium",
                  STATUS_TEXT[run.status],
                )}
              >
                {t(`status.${run.status}`)}
              </span>
            </div>

            {(run.sessionId || run.userId || (run.tags ?? []).length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {run.sessionId && (
                  <Link href={`/sessions/${encodeURIComponent(run.sessionId)}`}>
                    <Chip>{run.sessionId}</Chip>
                  </Link>
                )}
                {run.userId && (
                  <Link href={`/users/${encodeURIComponent(run.userId)}`}>
                    <Chip>{run.userId}</Chip>
                  </Link>
                )}
                {(run.tags ?? []).map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0">
            <Scorecard run={run} />
            <PhaseAccuracy phases={run.score.phases} className="mt-4" />
          </div>
        </div>
      </div>

      {/* 경로 — 이 런이 어디서 헛돌았는지 */}
      <section className="border-y border-hair bg-ink-750">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-2 flex flex-wrap items-baseline gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-fg-2 uppercase">
              {t("traces.executionPath")}
            </h2>
            <p className="text-xs text-fg-3">{t("traces.pathHint")}</p>
          </div>
          <ExecutionPath turns={run.turns} runId={run.id} />
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 py-8 pb-24 sm:px-6 lg:px-8">
        {scores.length > 0 && (
          <section className="mb-7">
            <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
              {t("scores.title")}
            </h2>
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-t border-hair pt-2">
              {scores.map((s) => (
                <div key={s.id} className="flex items-baseline gap-2">
                  <dt className="text-xs text-fg-3">{s.name}</dt>
                  <dd className="font-mono text-xs text-fg">
                    {s.stringValue ?? s.value?.toFixed(2) ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* 최종 답변의 숫자와 출처 */}
        {run.answer && (
          <section className="mb-8">
            <h2 className="mb-2 text-base font-semibold tracking-tight">
              {t("traces.answerBasis")}
            </h2>
            <p className="mb-4 max-w-2xl text-base text-fg-2">
              &ldquo;{run.answer.text}&rdquo;
            </p>
            <Card>
              <Provenance claims={run.answer.claims} turns={run.turns} />
            </Card>
          </section>
        )}

        {flagged.length > 0 && (
          <p className="mb-7 border-l-2 border-line-2 pl-4 text-sm leading-relaxed text-fg-2">
            {t("traces.couldHaveSaved", {
              turns: saved.turns,
              time: fmtDuration(saved.ms, t),
              tokens: saved.tokens.toLocaleString(),
            })}
          </p>
        )}

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            {t("traces.verdicts", { n: flagged.length })}
          </h2>
          <Link
            href={`/traces/${run.id}/timeline`}
            className="flex items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg"
          >
            {t("traces.openTimeline")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {flagged.length === 0 ? (
          <p className="rounded-lg border border-line px-6 py-8 text-center text-sm text-fg-3">
            {t("traces.noVerdicts")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {flagged.map((turn) => {
              const isWaste = turn.verdict === "waste";
              const note = turn.note!;
              return (
                <li key={turn.index}>
                  <Link
                    href={`/traces/${run.id}/timeline?obs=${turn.index}`}
                    className={cn(
                      "block rounded-r-md border-l-2 py-4 pr-5 pl-5 transition-colors",
                      isWaste
                        ? "border-warn bg-warn/[0.055] hover:bg-warn/[0.09]"
                        : "border-crit bg-crit/[0.055] hover:bg-crit/[0.09]",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase",
                          isWaste ? "text-warn" : "text-crit",
                        )}
                      >
                        <TriangleAlert className="h-3 w-3" aria-hidden />
                        {isWaste ? t("verdict.waste") : t("verdict.error")}
                      </span>
                      <span className="font-mono text-xs text-fg-3">
                        {t("traces.turnN", { n: turn.index })} · {t(`failure.${note.kind}`)}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold">{t(`note.${note.kind}`)}</h3>
                    <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-2">
                      {t(`why.${note.kind}`)}
                    </p>

                    <div className="mt-3 grid gap-5 border-t border-hair pt-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
                          {t("failure.observed")}
                        </p>
                        <EvidenceList items={note.evidence} />
                        <p className="mt-2 font-mono text-[11px] text-fg-3">
                          {t("failure.rule")} · {FAILURE_RULE[note.kind]}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
                          {t("failure.instead")}
                        </p>
                        <p className="font-mono text-xs leading-relaxed text-fg">
                          {t(`cf.${note.kind}`)}
                        </p>
                        <SavingsChips cf={note.counterfactual} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* 여기서부터가 모델이 쓴 부분이다. 위와 시각적으로 분리되어야 한다 —
            계산된 판정과 모델의 제안이 같은 무게로 보이면 이 제품의 주장이 무너진다. */}
        {flagged.length > 0 && briefs && (
          <div className="mt-10 border-t border-hair pt-8">
            {demo ? (
              <AnalysisDemoNotice />
            ) : (
              <AnalysisPanel runId={run.id} providers={providers} briefs={briefs} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
