"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, TriangleAlert } from "lucide-react";
import type { Run, Turn } from "@/lib/types";
import { FAILURE_RULE } from "@/lib/types";
import { buildTree } from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/shared";
import { fmtDuration, fmtUsd, turnResult, turnTitle } from "@/lib/verdict";
import { ContextXray, EvidenceList, SavingsChips } from "@/components/viz";
import { ExecutionPath } from "@/components/execution-path";
import { ContextStream } from "@/components/context-stream";
import { RunTree, type TreeMode, type TreeScope } from "@/components/run-tree";
import { SplitPane } from "@/components/split-pane";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Overview = "journey" | "context";
type Tab = "detail" | "messages" | "feedback" | "metadata";

const OVERVIEW_HINT: Record<Overview, MessageKey> = {
  journey: "traces.pathHint",
  context: "traces.contextHint",
};

const TABS: { key: Tab; label: MessageKey }[] = [
  { key: "detail", label: "traces.tabDetail" },
  { key: "messages", label: "traces.tabMessages" },
  { key: "feedback", label: "traces.tabFeedback" },
  { key: "metadata", label: "traces.tabMetadata" },
];

export function TraceExplorer({ run }: { run: Run }) {
  const t = useT();
  const turns = run.turns;

  /**
   * `?obs=147` 로 관측 하나를 직접 가리킬 수 있다.
   *
   * 해시(`#turn-147`)가 아니라 쿼리인 이유: 해시는 서버 렌더 때 읽을 수 없어
   * 첫 화면이 다른 관측을 고른 뒤 튀거나 하이드레이션이 어긋난다. 쿼리는 서버가
   * 그대로 받는다. 판정에서 관측으로 건너가는 링크가 실제로 도착해야 근거가 근거다.
   */
  const params = useSearchParams();
  const [sel, setSel] = useState(() => {
    const asked = Number(params.get("obs"));
    if (Number.isInteger(asked) && asked >= 0 && asked < turns.length) return asked;
    return turns.find((x) => x.note)?.index ?? 0;
  });
  const [overview, setOverview] = useState<Overview>("journey");
  const [mode, setMode] = useState<TreeMode>("tree");
  const [scope, setScope] = useState<TreeScope>("all");
  const [tab, setTab] = useState<Tab>("detail");

  const roots = useMemo(() => buildTree(turns), [turns]);
  const current = turns[sel] ?? turns[0];

  // ← / → 로 관측 사이를 옮긴다. 키보드 액션이므로 애니메이션은 없다.
  const move = useCallback(
    (delta: number) => setSel((i) => Math.min(turns.length - 1, Math.max(0, i + delta))),
    [turns.length],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight" || e.key === "j") move(1);
      else if (e.key === "ArrowLeft" || e.key === "k") move(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  return (
    <div>
      {/* ── 런 전체 모양 — 경로 / 컨텍스트 ────────────────────── */}
      <section className="border-y border-hair bg-ink-750">
        <div className="mx-auto max-w-[1600px] px-8 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={overview} onValueChange={(v) => setOverview(v as Overview)}>
              <TabsList>
                <TabsTrigger value="journey">{t("traces.viewPath")}</TabsTrigger>
                <TabsTrigger value="context">{t("traces.viewContext")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="max-w-xl text-xs text-fg-3">{t(OVERVIEW_HINT[overview])}</p>
          </div>

          {overview === "journey" ? (
            <ExecutionPath turns={turns} selected={sel} onSelect={setSel} />
          ) : (
            <ContextStream turns={turns} selected={sel} onSelect={setSel} />
          )}
        </div>
      </section>

      {/* ── 관측 트리 + 상세 ──────────────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-2.5">
          <p className="flex flex-wrap items-baseline gap-2.5 text-xs text-fg-3">
            <span className="text-fg-2">
              {t("traces.groupCount", { n: roots.length })}
            </span>
            <span>{t("traces.obsCount", { n: turns.length })}</span>
            <span>{t("traces.verdicts", { n: turns.filter((x) => x.note).length })}</span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented
              value={scope}
              onChange={(v) => setScope(v as TreeScope)}
              options={[
                { key: "all", label: t("traces.filterAll") },
                { key: "problems", label: t("traces.filterBad") },
              ]}
            />
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as TreeMode)}
              options={[
                { key: "tree", label: t("traces.viewTree") },
                { key: "waterfall", label: t("traces.viewWaterfall") },
              ]}
            />
          </div>
        </div>

        <SplitPane
          label={t("traces.treePane")}
          storageKey="kibitz.tracePane"
          initial={48}
          className="min-h-[60vh] pb-20"
          left={
            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto pr-2">
              <RunTree
                turns={turns}
                selected={sel}
                onSelect={setSel}
                mode={mode}
                scope={scope}
              />
              <p className="px-3 py-3 text-[11px] leading-relaxed text-fg-3">
                {t("traces.rollupNote")}
              </p>
            </div>
          }
          right={
            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto pl-6">
              <ObservationDetail
                run={run}
                turn={current}
                tab={tab}
                onTab={setTab}
                childCount={
                  turns.filter((x) => x.parentIndex === current.index).length
                }
              />
            </div>
          }
        />
      </div>
    </div>
  );
}

/* ── 세그먼트 컨트롤 ────────────────────────────────────────── */

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="flex rounded-full border border-line p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            // 색 전환만 — 자주 누르는 컨트롤이라 이동/스케일은 넣지 않는다
            "transition-colors duration-100",
            value === o.key
              ? "bg-fg text-ink-900"
              : "text-fg-3 hover:text-fg-2 active:scale-[0.97]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── 상세 패널 ──────────────────────────────────────────────── */

function ObservationDetail({
  run,
  turn,
  tab,
  onTab,
  childCount,
}: {
  run: Run;
  turn: Turn;
  tab: Tab;
  onTab: (t: Tab) => void;
  childCount: number;
}) {
  const t = useT();
  const result = turnResult(turn, t);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 -mx-1 bg-ink-900/95 px-1 pt-3 pb-2 backdrop-blur">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          <span>{t(`obs.${turn.obsType}`)}</span>
          <span aria-hidden>·</span>
          <span>{t("traces.turnN", { n: turn.index })}</span>
          {result && (
            <span
              className={cn(
                "rounded-sm px-1.5 py-px normal-case",
                turn.verdict === "error"
                  ? "bg-crit/15 text-crit"
                  : turn.verdict === "waste"
                    ? "bg-warn/15 text-warn"
                    : "bg-fill text-fg-2",
              )}
            >
              {result}
            </span>
          )}
          {(turn.attachments ?? 0) > 0 && (
            <span className="normal-case">
              {t("traces.attachments", { n: turn.attachments! })}
            </span>
          )}
        </div>

        <h3 className="text-[17px] leading-snug font-medium">{turnTitle(turn, t)}</h3>

        {turn.call && (
          <p className="mt-1.5 overflow-x-auto font-mono text-[13px] whitespace-nowrap text-fg-2">
            {turn.call}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)}>
            <TabsList>
              {TABS.map((x) => (
                <TabsTrigger key={x.key} value={x.key}>
                  {t(x.label)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Link
            href={`/playground?run=${run.id}&turn=${turn.index}`}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg active:scale-[0.97]"
          >
            {t("traces.openPlayground")}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-5">
        {turn.note && <VerdictBlock turn={turn} />}

        {tab === "detail" && (
          <>
            <Section label={t("traces.measured")}>
              <dl className="text-sm">
                <Row k={t("traces.selfDuration")} v={fmtDuration(turn.durationMs, t)} />
                <Row k={t("traces.startedAt")} v={`+${fmtDuration(turn.startOffsetMs, t)}`} />
                <Row k={t("dashboard.tokens")} v={turn.tokens.toLocaleString()} />
                <Row k={t("dashboard.cost")} v={fmtUsd(turn.costUsd)} />
                <Row k={t("traces.cumulativeRecords")} v={String(turn.recordsKnown)} />
                {childCount > 0 && <Row k={t("traces.childCount")} v={String(childCount)} />}
                {turn.parentIndex !== undefined && (
                  <Row k={t("traces.parent")} v={t("traces.turnN", { n: turn.parentIndex })} />
                )}
                {turn.callHash && <Row k={t("traces.argHash")} v={turn.callHash} />}
                <Row
                  k={t("verdict.label")}
                  v={t(`verdict.${turn.verdict}`)}
                  warn={turn.verdict === "error"}
                />
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-fg-3">
                {t("traces.measuredNote")}
              </p>
            </Section>

            <Section label={t("traces.contextTitle")}>
              <ContextXray
                frames={turn.context}
                registeredTools={run.registeredTools}
                usedTools={run.usedTools}
                unusedToolTokens={run.unusedToolTokens}
              />
            </Section>
          </>
        )}

        {tab === "messages" && (
          <>
            {turn.utterance && (
              <Section label={t("traces.wentIn")}>
                <p className="rounded-sm border border-hair bg-ink-750 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-fg-2">
                  {turn.utterance}
                </p>
              </Section>
            )}
            {turn.prompt && (
              <Section label={t("traces.wentIn")}>
                <Pre>{turn.prompt}</Pre>
              </Section>
            )}
            <Section label={t("traces.cameOut")}>
              <Pre>{turn.output}</Pre>
            </Section>
          </>
        )}

        {tab === "feedback" && <FeedbackPanel turn={turn} />}

        {tab === "metadata" && (
          <Section label={t("traces.tabMetadata")}>
            <dl className="text-sm">
              <Row k={t("filters.model")} v={run.model} />
              <Row k={t("filters.agent")} v={run.agent} />
              <Row k={t("app.project")} v={run.project} />
              {run.release && <Row k="release" v={run.release} />}
              {run.environment && <Row k="environment" v={run.environment} />}
              {run.sessionId && <Row k={t("filters.session")} v={run.sessionId} />}
              {run.userId && <Row k={t("filters.user")} v={run.userId} />}
              <Row k={t("phase.plan")} v={t(`phase.${turn.phase}`)} />
              <Row k={t("traces.observation")} v={`${run.id}#${turn.index}`} />
            </dl>
            {(run.tags ?? []).length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {(run.tags ?? []).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-2"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * 관측 단위 피드백.
 *
 * 로컬 상태다 — 백엔드가 없으므로 저장되는 척하지 않는다. 붙는 위치와 모양이
 * 진짜와 같아야 `lib/data.ts` 를 실제 API 로 바꿀 때 화면을 손대지 않는다.
 */
function FeedbackPanel({ turn }: { turn: Turn }) {
  const t = useT();
  const [given, setGiven] = useState<string | null>(null);
  const options = ["helpful", "partially_helpful", "not_helpful"];

  return (
    <Section label={t("traces.tabFeedback")}>
      {given ? (
        <p className="text-sm text-fg-2">
          <span className="font-mono text-fg">{given}</span> · {t("traces.turnN", { n: turn.index })}
        </p>
      ) : (
        <p className="text-sm text-fg-3">{t("traces.noFeedback")}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => setGiven(o)}
            aria-pressed={given === o}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-100 active:scale-[0.97]",
              given === o
                ? "border-fg bg-fg text-ink-900"
                : "border-line text-fg-2 hover:border-line-3 hover:text-fg",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ── 하위 컴포넌트 ──────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
        {label}
      </h4>
      {children}
    </section>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">
      {children}
    </pre>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-b border-hair py-1.5 last:border-b-0">
      <dt className="shrink-0 text-fg-3">{k}</dt>
      <dd className={cn("truncate font-mono text-xs", warn ? "text-crit" : "text-fg-2")}>
        {v}
      </dd>
    </div>
  );
}

/**
 * 판정 블록.
 *
 * 헤드라인 → 왜 → **관측치** → 반사실. 관측치를 빼면 우리도 그냥
 * 믿으라는 소리를 하는 것이므로, 근거를 항상 같이 보여준다.
 */
export function VerdictBlock({ turn }: { turn: Turn }) {
  const t = useT();
  const note = turn.note!;
  const isWaste = turn.verdict === "waste";
  return (
    <div
      className={cn(
        "rounded-r-sm border-l-2 px-4 py-3",
        isWaste ? "border-warn bg-warn/[0.055]" : "border-crit bg-crit/[0.055]",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase",
            isWaste ? "text-warn" : "text-crit",
          )}
        >
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {isWaste ? t("verdict.waste") : t("verdict.error")}
        </span>
        <span className="font-mono text-xs text-fg-3">{t(`failure.${note.kind}`)}</span>
      </div>

      <h4 className="mb-1.5 text-sm font-semibold">{t(`note.${note.kind}`)}</h4>
      <p className="text-sm leading-relaxed text-fg-2">{t(`why.${note.kind}`)}</p>

      <div className="mt-3 border-t border-hair pt-2.5">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
          {t("failure.observed")}
        </p>
        <EvidenceList items={note.evidence} />
        <p className="mt-2 font-mono text-[11px] text-fg-3">
          {t("failure.rule")} · {FAILURE_RULE[note.kind]}
        </p>
      </div>

      <div className="mt-3 border-t border-hair pt-2.5">
        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
          {t("failure.instead")}
        </p>
        <p className="font-mono text-xs leading-relaxed text-fg">{t(`cf.${note.kind}`)}</p>
        <SavingsChips cf={note.counterfactual} />
      </div>
    </div>
  );
}
