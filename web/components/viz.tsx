"use client";

import type {
  ContextFrame,
  ContextRole,
  Counterfactual,
  Evidence,
  PhaseScore,
  Run,
  Turn,
  Verdict,
} from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { VERDICT_FILL } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/* ── Sparkline ─────────────────────────────────────────────── */

export function Sparkline({
  values,
  className,
  height = 28,
}: {
  values: number[];
  className?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const w = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── MiniRibbon — 목록 행에 들어가는 압축 요약 ───────────────── */

/** 나쁜 쪽이 이긴다. 압축해도 문제 지점이 사라지면 안 된다. */
const SEVERITY: Record<Verdict, number> = { good: 0, human: 1, waste: 2, error: 3 };
const SLOTS = 48;

export function MiniRibbon({ turns, className }: { turns: Turn[]; className?: string }) {
  // 실측 런은 160턴짜리도 있다. 턴마다 칸을 그리면 열 너비를 밀고 나가
  // 옆 칼럼 위에 겹쳐 그려진다 — 실제로 그렇게 깨졌었다.
  // 칸 수를 고정하고 구간마다 **가장 나쁜 판정**을 남긴다.
  const size = Math.ceil(turns.length / SLOTS) || 1;
  const cells: Verdict[] = [];
  for (let i = 0; i < turns.length; i += size) {
    cells.push(
      turns
        .slice(i, i + size)
        .reduce<Verdict>(
          (worst, t) => (SEVERITY[t.verdict] > SEVERITY[worst] ? t.verdict : worst),
          "good",
        ),
    );
  }

  return (
    <div
      className={cn("flex h-5 min-w-0 items-stretch gap-[1.5px] overflow-hidden", className)}
      aria-hidden
    >
      {cells.map((v, i) => (
        <span
          key={i}
          className={cn("relative min-w-0 flex-1 rounded-[2px]", v === "human" && "hatch")}
          style={{
            background: VERDICT_FILL[v],
            opacity: v === "good" ? 0.7 : v === "human" ? 0.5 : 0.92,
          }}
        />
      ))}
    </div>
  );
}

/* ── Scorecard ─────────────────────────────────────────────── */

export function Scorecard({ run, className }: { run: Run; className?: string }) {
  const t = useT();
  const s = run.score;
  const items = [
    { n: `${s.accuracy}%`, l: t("traces.accuracy"), tone: "" },
    { n: String(s.errors), l: t("viz.errors"), tone: s.errors ? "text-crit" : "text-fg-2" },
    { n: String(s.wastes), l: t("viz.wastes"), tone: "text-fg-2" },
    { n: `${s.wastedTokenPct}%`, l: t("viz.wastedTokens"), tone: "text-fg-2" },
  ];
  return (
    <div className={cn("flex gap-8", className)}>
      {items.map((it) => (
        <div key={it.l}>
          <p className={cn("text-2xl font-semibold tracking-tight", it.tone)}>{it.n}</p>
          <p className="mt-1.5 text-xs font-medium tracking-wide text-fg-3 uppercase">
            {it.l}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── 국면별 정확도 ──────────────────────────────────────────── */

export function PhaseAccuracy({
  phases,
  className,
}: {
  phases: PhaseScore[];
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("flex gap-6 border-t border-hair pt-3.5", className)}>
      {phases.map((p) => (
        <div key={p.phase}>
          <p
            className={cn(
              "text-base font-semibold",
              p.accuracy < 70 ? "text-crit" : "text-fg-2",
            )}
          >
            {p.accuracy}%
          </p>
          <p className="text-xs text-fg-3">{t(`phase.${p.phase}`)}</p>
        </div>
      ))}
    </div>
  );
}

/* ── 판정 근거 — 기계가 직접 관측한 값 ──────────────────────── */

export function EvidenceList({ items }: { items: Evidence[] }) {
  const t = useT();
  return (
    <dl className="grid gap-1.5">
      {items.map((e) => (
        <div key={e.label} className="flex items-baseline gap-3 text-sm">
          <dt className="w-32 shrink-0 text-fg-3">{t(`evidence.${e.label}`)}</dt>
          <dd className="flex flex-wrap items-baseline gap-2 font-mono text-xs">
            <span
              className={cn(
                e.relation === "absent" || e.relation === "missing"
                  ? "text-crit"
                  : "text-fg",
              )}
            >
              {e.valueKey ? t(`evalue.${e.valueKey}`) : e.value}
            </span>
            {e.compare && (
              <>
                <span className="font-sans text-fg-3">
                  {e.relation === "same" ? t("failure.sameAsPrev") : t("viz.vs")}
                </span>
                <span className="text-fg-2">
                  {e.compareTurn !== undefined
                    ? `${t("traces.turnN", { n: e.compareTurn })} · ${e.compare}`
                    : e.compare}
                </span>
              </>
            )}
            {e.relation === "missing" && (
              <span className="font-sans text-fg-3">{t("failure.missingHere")}</span>
            )}
            {e.relation === "absent" && (
              <span className="font-sans text-fg-3">{t("failure.notInAnySource")}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 반사실 절약분 ─────────────────────────────────────────── */

export function SavingsChips({ cf }: { cf: Counterfactual }) {
  const t = useT();
  const chips = [
    cf.savedTurns > 0 && t("viz.savedTurns", { n: cf.savedTurns }),
    cf.savedMs > 0 && t("viz.savedSec", { n: (cf.savedMs / 1000).toFixed(1) }),
    cf.savedTokens > 0 && t("viz.savedTokens", { n: cf.savedTokens.toLocaleString() }),
  ].filter(Boolean) as string[];

  if (!chips.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {chips.map((c) => (
        <span key={c} className="text-sm text-fg-2">
          <b className="font-semibold text-fg">{c}</b> {t("viz.saved")}
        </span>
      ))}
    </div>
  );
}

/* ── Context X-ray — 한 턴의 컨텍스트 구성 ──────────────────── */

const XRAY_GREY = ["#2B3038", "#353B44", "#414852", "#4A525D", "#5E6873"];

/**
 * 어떤 라벨 집합이든 받는다.
 *
 * 목 데이터는 역할별(시스템·툴 정의·히스토리…)로 쪼개지만, 실제 Claude Code
 * 기록에는 역할별 분해가 없다 — 대신 캐시 계층(읽기·쓰기·신규 입력)이 실측으로
 * 남는다. 없는 분해를 추정해서 채우느니 있는 축을 그대로 보여준다.
 *
 * `hotLabel`이 주어지면 그 밴드만 색을 얻는다. 색은 문제에만 쓴다.
 */
export function ContextXray({
  frames,
  registeredTools,
  usedTools,
  unusedToolTokens,
  hotLabel = "tools",
}: {
  frames: ContextFrame[];
  registeredTools: number;
  usedTools: number;
  unusedToolTokens: number;
  hotLabel?: ContextRole;
}) {
  const t = useT();
  const total = frames.reduce((a, f) => a + f.tokens, 0) || 1;
  const toolIdx = frames.findIndex((f) => f.label === hotLabel);
  const toolPct = Math.round(((frames[toolIdx]?.tokens ?? 0) / total) * 100);
  const fill = (i: number) => (i === toolIdx ? "rgb(217 164 65 / 34%)" : XRAY_GREY[i]);
  // 미사용 도구 부담은 그 값이 실제로 계측된 런에서만 말한다
  const showToolNote = registeredTools > 0 && unusedToolTokens > 0;

  return (
    <div>
      <div className="mb-3 flex h-6 gap-[1.5px] overflow-hidden rounded-sm">
        {frames.map((f, i) => (
          <span key={f.label} style={{ flex: `0 0 ${(f.tokens / total) * 100}%`, background: fill(i) }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {frames.map((f, i) => (
          <li
            key={f.label}
            className={cn(
              "flex items-center gap-2 text-sm",
              i === toolIdx ? "text-fg" : "text-fg-2",
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: fill(i) }} />
            {t(`context.${f.label}`)}
            <span className="ml-auto font-mono text-xs text-fg-3">
              {f.tokens.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      {showToolNote && (
        <p className="mt-3 rounded-r-sm border-l-2 border-warn bg-warn/[0.055] px-3 py-2.5 text-sm leading-relaxed text-fg-2">
          {t("viz.toolNote", {
            registered: registeredTools,
            used: usedTools,
            unused: registeredTools - usedTools,
            tokens: unusedToolTokens.toLocaleString(),
            pct: toolPct,
          })}
        </p>
      )}
    </div>
  );
}
