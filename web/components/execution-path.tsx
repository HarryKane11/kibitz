"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { Turn } from "@/lib/types";
import { findLoops } from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import { usePersisted } from "@/lib/persisted";
import type { MessageKey } from "@/lib/i18n/shared";
import { fmtDuration, turnTitle } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 실행 경로 — 렌즈를 바꿔 보는 하나의 차트.
 *
 * 이전 버전은 그림이었다: hover 는 브라우저 기본 `<title>` 이라 1초를 기다려야 했고,
 * 확대가 없어 160턴 런에서는 점이 6px 간격으로 뭉쳤고, 클릭해도 아무 일이 없었다.
 * 그래서 "보기 불편하다"가 맞는 지적이었다 — 읽을 수는 있지만 **물어볼 수가 없었다.**
 *
 * 세 렌즈가 같은 데이터를 다른 질문으로 본다:
 *
 *   path    진행이 있었나        y = 이 턴까지 확보한 고유 레코드 (계측값)
 *   flame   시간이 어디로 갔나   x = 벽시계, y = 트리 깊이, 폭 = 소요시간
 *   tokens  돈이 어디로 갔나     y = 그 턴이 쓴 토큰
 *   tools   어디서 돌았나        y = 도구 레인, 지그재그가 곧 왕복이다
 *   phase   국면을 오갔나        y = plan·gather·reason·deliver
 *
 * 상호작용은 셋이 공유한다. 구현이 하나여야 렌즈를 바꿀 때 조작법이 바뀌지 않는다:
 *   - 포인터를 올리면 십자선과 카드. `<title>` 이 아니라 즉시 뜬다.
 *   - 가로로 끌면 그 구간만 확대. 스크롤을 가로채지 않는다 — 페이지 안의 차트가
 *     휠을 먹으면 사용자는 페이지를 내리려다 차트를 확대하게 된다.
 *   - 클릭하면 그 관측으로 간다.
 *
 * 애니메이션은 없다. 렌즈 전환과 hover 는 하루에 수십 번 하는 동작이고,
 * 그 자리에 트랜지션을 넣으면 도구가 느려진 것처럼 느껨진다.
 */

export type Lens = "path" | "flame" | "tokens" | "tools" | "phase";

const LENSES: { id: Lens; label: MessageKey; hint: MessageKey }[] = [
  { id: "path", label: "viz.lensPath", hint: "viz.lensPathHint" },
  { id: "flame", label: "viz.lensFlame", hint: "viz.lensFlameHint" },
  { id: "tokens", label: "viz.lensTokens", hint: "viz.lensTokensHint" },
  { id: "tools", label: "viz.lensTools", hint: "viz.lensToolsHint" },
  { id: "phase", label: "viz.lensPhase", hint: "viz.lensPhaseHint" },
];

const W = 1000; // viewBox 폭. 실제 픽셀은 CSS 가 정한다.
const H = 190;
const PAD_L = 8;
const PAD_R = 8;
const PAD_TOP = 20;
const PAD_BOTTOM = 44; // 아래는 되돌아가는 호와 축 라벨이 쓴다
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function verdictColor(t: Turn): string {
  return t.verdict === "error"
    ? "var(--color-crit)"
    : t.verdict === "waste"
      ? "var(--color-warn)"
      : t.verdict === "human"
        ? "var(--color-turn-wait)"
        : "var(--color-turn-good)";
}

export function ExecutionPath({
  turns,
  runId,
  selected,
  onSelect,
  className,
}: {
  turns: Turn[];
  /** 있으면 클릭이 그 트레이스의 타임라인으로 이동한다 */
  runId?: string;
  selected?: number;
  onSelect?: (i: number) => void;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [lens, setLens] = usePersisted<Lens>("kibitz.pathLens", "path");
  /** 확대 구간. 관측 번호 기준으로 하나만 둔다 — 렌즈마다 다르면 전환할 때 시점을 잃는다. */
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const lo = zoom ? Math.max(0, zoom[0]) : 0;
  const hi = zoom ? Math.min(turns.length - 1, zoom[1]) : turns.length - 1;
  const view = useMemo(() => turns.slice(lo, hi + 1), [turns, lo, hi]);
  const zoomed = lo > 0 || hi < turns.length - 1;

  /* ── 좌표계 ────────────────────────────────────────────────
     x 는 렌즈에 따라 관측 순서이거나 벽시계다. 두 경우를 한 함수로 덮으면
     둘 다 틀리므로 렌즈별로 나눈다. */

  const plotW = W - PAD_L - PAD_R;
  const step = plotW / Math.max(1, view.length - 1);

  const timeSpan = useMemo(() => {
    if (view.length === 0) return { t0: 0, t1: 1 };
    const t0 = view[0].startOffsetMs;
    const t1 = Math.max(
      ...view.map((v) => v.startOffsetMs + Math.max(v.durationMs, 0)),
      t0 + 1,
    );
    return { t0, t1 };
  }, [view]);

  const xIndex = (k: number) => PAD_L + k * step;
  const xTime = (ms: number) =>
    PAD_L + ((ms - timeSpan.t0) / (timeSpan.t1 - timeSpan.t0)) * plotW;

  /** 포인터 x(0~1) → 보이는 관측의 인덱스 */
  const nearest = (ratio: number): number => {
    if (view.length === 0) return lo;
    if (lens === "flame") {
      const ms = timeSpan.t0 + ratio * (timeSpan.t1 - timeSpan.t0);
      let best = 0;
      let bestGap = Infinity;
      view.forEach((v, k) => {
        const start = v.startOffsetMs;
        const end = start + Math.max(v.durationMs, 0);
        const gap = ms < start ? start - ms : ms > end ? ms - end : 0;
        if (gap < bestGap) {
          bestGap = gap;
          best = k;
        }
      });
      return lo + best;
    }
    return lo + Math.min(view.length - 1, Math.max(0, Math.round(ratio * (view.length - 1))));
  };

  const ratioOf = (e: React.PointerEvent) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return 0;
    const inner = box.width * ((W - PAD_L - PAD_R) / W);
    const left = box.left + box.width * (PAD_L / W);
    return Math.min(1, Math.max(0, (e.clientX - left) / inner));
  };

  const onMove = (e: React.PointerEvent) => {
    const r = ratioOf(e);
    setHover(nearest(r));
    if (drag) setDrag({ ...drag, to: nearest(r) });
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const i = nearest(ratioOf(e));
    setDrag({ from: i, to: i });
    // 포인터를 잡아 두면 차트 밖으로 나가도 끌기가 이어진다 —
    // 안 잡으면 경계에서 손을 놓았을 때 확대가 취소된 것처럼 보인다.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onUp = () => {
    if (!drag) return;
    const [a, b] = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
    setDrag(null);
    // 3개 미만이면 확대가 아니라 클릭이다. 확대가 되면 클릭으로 못 넘어간다.
    if (b - a >= 2) {
      setZoom([a, b]);
      return;
    }
    jump(a);
  };

  const jump = (i: number) => {
    if (onSelect) {
      onSelect(i);
      return;
    }
    if (runId) router.push(`/traces/${runId}/timeline?obs=${i}`);
  };

  /**
   * 도구 레인 — **부른 도구 전부**. 자주 부른 것부터 위로.
   *
   * 처음엔 상위 10개만 주고 나머지를 접었다. 현재 픽스처의 도구 수가 런당 5~9개라
   * 그 자르기는 한 번도 발동하지 않았지만, MCP 서버를 붙인 Claude Code 는 도구가
   * 30~60개가 되므로 언젠가 반드시 발동하고 그때 조용히 정보를 잃는다.
   *
   * 그래서 자르는 대신 **높이를 레인 수에 맞춘다** (아래 `plotH`). 레인 차트의
   * 자연스러운 높이는 고정값이 아니라 레인 수의 함수다. 빈도순인 이유는 자주
   * 오가는 짝이 서로 붙어야 왕복이 짧은 지그재그로 보이기 때문이다.
   *
   * `LANE_CAP` 은 병리적인 경우(도구 수백 개)의 안전장치이고, 걸리면 라벨이 말한다.
   */
  const toolLanes = useMemo(() => {
    const count = new Map<string, number>();
    for (const v of view) {
      if (!v.call) continue;
      const tool = v.call.split("(")[0];
      count.set(tool, (count.get(tool) ?? 0) + 1);
    }
    const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (ranked.length <= LANE_CAP) return ranked;
    return [...ranked.slice(0, LANE_CAP), OTHER_LANE];
  }, [view]);

  /**
   * 레인 렌즈는 자기 높이를 갖는다. 나머지 셋은 기본 높이를 쓴다.
   *
   * 레인이 늘어날 때 고정 높이를 유지하면 각 레인이 6px 로 눌리고, 그 순간
   * 차트가 아니라 무늬가 된다. 대신 세로로 늘리고, 너무 길어지면 스크롤한다.
   */
  const lanes = lens === "tools" ? toolLanes.length : lens === "phase" ? PHASE_LANES.length : 0;
  const plotH = lanes > 0 ? Math.max(PLOT_H, lanes * ROW_UNITS) : PLOT_H;
  const svgH = PAD_TOP + plotH + PAD_BOTTOM;

  const laneOfTool = (v: Turn) => {
    if (!v.call) return toolLanes.indexOf(OTHER_LANE);
    const tool = v.call.split("(")[0];
    const at = toolLanes.indexOf(tool);
    return at >= 0 ? at : toolLanes.indexOf(OTHER_LANE);
  };

  /** 세로축이 무엇을 재는지. 기준값 없는 차트는 장식이다. */
  const yLabel = useMemo(() => {
    if (view.length === 0) return "";
    if (lens === "path") {
      return t("viz.axisRecords", { n: Math.max(1, ...view.map((v) => v.recordsKnown)) });
    }
    if (lens === "tokens") {
      return t("viz.axisTokens", {
        n: Math.max(...view.map((v) => v.tokens)).toLocaleString(),
      });
    }
    if (lens === "tools") return t("viz.axisTools", { n: toolLanes.length });
    if (lens === "phase") return t("viz.axisPhase");
    return t("viz.axisDepth");
  }, [lens, view, t, toolLanes.length]);

  const hovered = hover !== null ? turns[hover] : null;

  return (
    <div className={cn("w-full", className)}>
      {/* 렌즈 — 하루에 여러 번 누르는 곳이라 애니메이션을 넣지 않는다 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex rounded-full border border-line p-0.5">
          {LENSES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              aria-pressed={lens === l.id}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-100",
                lens === l.id
                  ? "bg-fg text-ink-900"
                  : "text-fg-3 hover:text-fg-2 active:scale-[0.97]",
              )}
            >
              {t(l.label)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-fg-3">
          {t(LENSES.find((l) => l.id === lens)!.hint)}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {zoomed ? (
            <button
              onClick={() => setZoom(null)}
              className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg active:scale-[0.97]"
            >
              <X className="h-3 w-3" aria-hidden />
              {t("viz.zoomReset", { from: lo, to: hi })}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-fg-3">
              <Search className="h-3 w-3" aria-hidden />
              {t("viz.zoomHint")}
            </span>
          )}
        </div>
      </div>

      <div
        ref={wrap}
        className="relative w-full touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerLeave={() => {
          setHover(null);
          setDrag(null);
        }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onDoubleClick={() => setZoom(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${svgH}`}
          // 레인 렌즈는 x(순서)와 y(범주) 둘 다 비율이 의미 없으므로 각각 늘려도 된다.
          // 그 대신 마크를 rect 로 그린다 — circle 은 비균등 스케일에서 타원이 된다.
          preserveAspectRatio={lanes > 0 ? "none" : undefined}
          style={{ height: lanes > 0 ? `${Math.min(svgH * 1.15, 460)}px` : "190px" }}
          className={cn("block w-full", drag ? "cursor-col-resize" : "cursor-crosshair")}
          role="img"
          aria-label={t("viz.pathAria")}
        >
          {lens === "path" && (
            <PathLens turns={turns} view={view} lo={lo} x={xIndex} step={step} />
          )}
          {lens === "flame" && <FlameLens view={view} x={xTime} />}
          {lens === "tokens" && <TokensLens view={view} x={xIndex} step={step} />}
          {lens === "tools" && (
            <LaneLens view={view} x={xIndex} step={step} plotH={plotH} lanes={toolLanes} laneOf={laneOfTool} />
          )}
          {lens === "phase" && (
            <LaneLens
              view={view}
              x={xIndex}
              step={step}
              plotH={plotH}
              lanes={PHASE_LANES}
              laneOf={(v) => PHASE_LANES.indexOf(v.phase)}
            />
          )}

          {/* 선택·hover 표시는 렌즈 위에 공통으로 얹는다 */}
          {selected !== undefined && selected >= lo && selected <= hi && (
            <line
              x1={lens === "flame" ? xTime(turns[selected].startOffsetMs) : xIndex(selected - lo)}
              x2={lens === "flame" ? xTime(turns[selected].startOffsetMs) : xIndex(selected - lo)}
              y1={PAD_TOP - 6}
              y2={PAD_TOP + plotH + 6}
              stroke="var(--color-sky)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover !== null && (
            <line
              x1={lens === "flame" ? xTime(turns[hover].startOffsetMs) : xIndex(hover - lo)}
              x2={lens === "flame" ? xTime(turns[hover].startOffsetMs) : xIndex(hover - lo)}
              y1={PAD_TOP - 6}
              y2={PAD_TOP + plotH + 6}
              stroke="var(--line-3)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {drag && Math.abs(drag.to - drag.from) >= 1 && (
            <rect
              x={
                lens === "flame"
                  ? Math.min(xTime(turns[drag.from].startOffsetMs), xTime(turns[drag.to].startOffsetMs))
                  : Math.min(xIndex(drag.from - lo), xIndex(drag.to - lo))
              }
              width={Math.abs(
                lens === "flame"
                  ? xTime(turns[drag.to].startOffsetMs) - xTime(turns[drag.from].startOffsetMs)
                  : xIndex(drag.to - lo) - xIndex(drag.from - lo),
              )}
              y={PAD_TOP - 6}
              height={plotH + 12}
              fill="var(--color-sky)"
              fillOpacity={0.12}
              stroke="var(--color-sky)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* 레인 이름. 마크를 가리지 않게 반투명 바탕에 얹는다. */}
        {(lens === "tools" || lens === "phase") && (
          <LaneLabels lanes={lens === "tools" ? toolLanes : PHASE_LANES} plotH={plotH} svgH={svgH} />
        )}

        {/* hover 카드. HTML 이라 줄바꿈·굵기·정렬을 쓸 수 있다 —
            SVG `<title>` 은 1초를 기다려야 뜨고 서식이 없다. */}
        {hovered && hover !== null && (
          <HoverCard
            turn={hovered}
            index={hover}
            atRatio={
              lens === "flame"
                ? (xTime(hovered.startOffsetMs) - PAD_L) / plotW
                : (xIndex(hover - lo) - PAD_L) / plotW
            }
          />
        )}
      </div>

      {/* 축 라벨은 SVG 밖에 둔다. 그래야 폰트 크기가 차트 폭에 따라 늘어나지 않는다. */}
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-fg-3">
        <span>{lens === "flame" ? "0s" : t("viz.turnN", { n: lo })}</span>
        <span className="text-fg-3">{yLabel}</span>
        <span>
          {lens === "flame"
            ? fmtDuration(timeSpan.t1 - timeSpan.t0, t)
            : t("viz.turnN", { n: hi })}
        </span>
      </div>

      {/* 카드가 떠 있으면 같은 내용을 두 번 쓰지 않는다. 이 줄은 선택 상태를 위한 것이다. */}
      {!hovered && selected !== undefined && turns[selected] && (
        <p className="mt-1 truncate text-[11px] text-fg-3">
          {t("viz.turnN", { n: selected })} · {turnTitle(turns[selected], t)}
        </p>
      )}
    </div>
  );
}

/* ── 렌즈 1: 진행 ───────────────────────────────────────────── */

function PathLens({
  turns,
  view,
  lo,
  x,
  step,
}: {
  turns: Turn[];
  view: Turn[];
  lo: number;
  x: (k: number) => number;
  step: number;
}) {
  const loops = useMemo(() => findLoops(turns), [turns]);
  const maxRecords = Math.max(1, ...view.map((v) => v.recordsKnown));
  const y = (v: number) => PAD_TOP + (1 - v / maxRecords) * PLOT_H;

  // 160턴이면 점이 6px 간격으로 겹쳐 애벌레가 된다. 선은 전부 그리고 점만 솎아낸다 —
  // 단 판정이 붙은 턴은 절대 빠뜨리지 않는다. 확대하면 다시 다 나온다.
  const dense = step < 9;
  const every = Math.max(1, Math.ceil(9 / Math.max(step, 0.5)));

  return (
    <>
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--hair)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {/* 되돌아가는 호 — 같은 인자로 다시 부른 지점 */}
      {loops
        .filter((l) => l.from >= lo && l.to >= lo && l.from - lo < view.length && l.to - lo < view.length)
        .map((l) => {
          const from = x(l.from - lo);
          const to = x(l.to - lo);
          const base = y(turns[l.from].recordsKnown);
          return (
            <path
              key={`${l.from}-${l.to}`}
              d={`M${from} ${base + 5} C ${from} ${base + 26}, ${to} ${base + 26}, ${to} ${base + 5}`}
              fill="none"
              stroke="var(--color-crit)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

      {view.slice(1).map((v, k) => {
        const prev = view[k];
        const dead = v.recordsKnown === prev.recordsKnown;
        return (
          <line
            key={v.index}
            x1={x(k)}
            y1={y(prev.recordsKnown)}
            x2={x(k + 1)}
            y2={y(v.recordsKnown)}
            stroke={dead ? "var(--line-2)" : "var(--color-sky)"}
            strokeWidth={dead ? 1.2 : 1.8}
            strokeDasharray={dead ? "4 4" : undefined}
            strokeOpacity={dead ? 1 : 0.75}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {view.map((v, k) => {
        const flagged = v.verdict !== "good";
        if (dense && !flagged && k !== 0 && k !== view.length - 1 && k % every !== 0) return null;
        const r = (dense && !flagged ? 2.2 : 3.4) + Math.min(3.6, Math.sqrt(v.tokens) / 34);
        return (
          <circle
            key={v.index}
            cx={x(k)}
            cy={y(v.recordsKnown)}
            r={r}
            fill={verdictColor(v)}
            stroke="var(--color-ink-750)"
            strokeWidth={1.2}
          />
        );
      })}
    </>
  );
}

/* ── 렌즈 2: 시간 ───────────────────────────────────────────── */

/**
 * 플레임 — x 는 벽시계, 행은 트리 깊이.
 *
 * 진행 곡선은 "얻은 것"을 말하지만 시간을 말하지 않는다. 1시간 21분이 어디로 갔는지는
 * 이쪽에서만 보인다: 넓은 사각형이 오래 걸린 호출이고, 빈 구간이 아무 일도 없던 시간이다.
 */
function FlameLens({ view, x }: { view: Turn[]; x: (ms: number) => number }) {
  const byIndex = new Map(view.map((v) => [v.index, v]));
  const depthOf = (v: Turn): number => {
    let d = 0;
    let cur = v;
    while (cur.parentIndex !== undefined && d < 6) {
      const parent = byIndex.get(cur.parentIndex);
      if (!parent) break;
      cur = parent;
      d += 1;
    }
    return d;
  };

  const rows = Math.max(1, ...view.map((v) => depthOf(v) + 1));
  // 행 높이에 상한을 두면 깊이가 1~2일 때 그림이 위쪽에 몰리고 아래가 빈다.
  // 빈 공간은 "데이터가 없다"로 읽히므로 있는 만큼 채운다.
  const rowH = PLOT_H / rows;

  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <line
          key={r}
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_TOP + r * rowH + rowH}
          y2={PAD_TOP + r * rowH + rowH}
          stroke="var(--hair)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {view.map((v) => {
        const x0 = x(v.startOffsetMs);
        const x1 = x(v.startOffsetMs + Math.max(v.durationMs, 0));
        const d = depthOf(v);
        return (
          <rect
            key={v.index}
            x={x0}
            // 아주 짧은 호출도 보여야 한다. 0폭이면 그 호출은 없는 것이 된다.
            width={Math.max(1.2, x1 - x0)}
            y={PAD_TOP + d * rowH + 2}
            height={Math.max(4, rowH - 5)}
            rx={1.5}
            fill={verdictColor(v)}
            fillOpacity={v.verdict === "good" ? 0.55 : 0.9}
          />
        );
      })}
    </>
  );
}

/* ── 렌즈 3: 토큰 ───────────────────────────────────────────── */

function TokensLens({
  view,
  x,
  step,
}: {
  view: Turn[];
  x: (k: number) => number;
  step: number;
}) {
  const max = Math.max(1, ...view.map((v) => v.tokens));
  const barW = Math.max(1, Math.min(14, step * 0.72));

  return (
    <>
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={PAD_TOP + PLOT_H}
        y2={PAD_TOP + PLOT_H}
        stroke="var(--hair)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {view.map((v, k) => {
        const h = (v.tokens / max) * PLOT_H;
        return (
          <rect
            key={v.index}
            x={x(k) - barW / 2}
            width={barW}
            // 데이터 끝은 바닥선에 붙는다. 4px 라운드는 위쪽 두 각에만.
            y={PAD_TOP + PLOT_H - Math.max(h, 1)}
            height={Math.max(h, 1)}
            rx={Math.min(2, barW / 2)}
            fill={verdictColor(v)}
            fillOpacity={v.verdict === "good" ? 0.6 : 0.95}
          />
        );
      })}
    </>
  );
}

/* ── 렌즈 4·5: 레인 ─────────────────────────────────────────────
   같은 구현이 도구와 국면을 모두 그린다. 레인 뜻만 다르고 읽는 법은 같아야 한다 —
   렌즈를 바꿀 때 조작법이 바뀌면 그건 다섯 개의 다른 차트다. */

const OTHER_LANE = "…";
const PHASE_LANES = ["plan", "gather", "reason", "deliver"] as const;
/** 레인 하나의 높이 (viewBox 단위). 라벨 10px + 여백이 들어갈 최소치. */
const ROW_UNITS = 22;
/** 병리적인 경우의 안전장치. 걸리면 라벨이 접혔다고 말한다. */
const LANE_CAP = 40;

/**
 * 피아노 롤. x = 관측 순서, y = 레인.
 *
 * 왕복이 **지그재그로 보인다** — `Edit → Read → Edit` 는 두 레인 사이를 오가는 선이
 * 되고, 그건 설명 없이 읽힌다. 진행 곡선은 "얻은 것이 없다"까지만 말하고
 * 무엇을 되풀이했는지는 말하지 않는다.
 *
 * 마크가 circle 이 아니라 rect 인 이유: 이 렌즈는 x·y 를 각각 늘리므로
 * (`preserveAspectRatio="none"`) 원이 타원으로 찌그러진다.
 */
function LaneLens({
  view,
  x,
  step,
  plotH,
  lanes,
  laneOf,
}: {
  view: Turn[];
  x: (k: number) => number;
  step: number;
  plotH: number;
  lanes: readonly string[];
  laneOf: (v: Turn) => number;
}) {
  const rows = Math.max(1, lanes.length);
  const rowH = plotH / rows;
  const cy = (lane: number) => PAD_TOP + lane * rowH + rowH / 2;
  // 마크 크기는 x 는 간격, y 는 레인 높이에 맞춘다 — 둘의 스케일이 다르므로 따로 정한다.
  const mw = Math.max(1.4, Math.min(9, step * 0.55));
  const mh = Math.max(3, Math.min(9, rowH * 0.42));

  // 레인이 촘촘하면 잇는 선이 오히려 덩어리가 된다. 성기면 이동이 보여야 한다.
  const link = view.length <= 260;

  return (
    <>
      {lanes.map((_, i) => (
        <line
          key={i}
          x1={PAD_L}
          x2={W - PAD_R}
          y1={cy(i)}
          y2={cy(i)}
          stroke="var(--hair)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {link &&
        view.slice(1).map((v, k) => {
          const a = laneOf(view[k]);
          const b = laneOf(v);
          if (a < 0 || b < 0) return null;
          return (
            <line
              key={`l${v.index}`}
              x1={x(k)}
              y1={cy(a)}
              x2={x(k + 1)}
              y2={cy(b)}
              stroke="var(--line-2)"
              strokeWidth={1}
              // 같은 레인에 머무르는 구간은 흐리게 — 이동이 도드라져야 한다
              strokeOpacity={a === b ? 0.4 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

      {view.map((v, k) => {
        const lane = laneOf(v);
        if (lane < 0) return null;
        const flagged = v.verdict !== "good";
        const w = flagged ? mw * 1.5 : mw;
        const h = flagged ? mh * 1.4 : mh;
        return (
          <rect
            key={v.index}
            x={x(k) - w / 2}
            y={cy(lane) - h / 2}
            width={w}
            height={h}
            rx={Math.min(1.5, w / 2)}
            fill={verdictColor(v)}
          />
        );
      })}
    </>
  );
}

/** 레인 이름. SVG 안에 넣으면 폭에 따라 글자가 늘어나므로 HTML 로 겹쳐 놓는다. */
function LaneLabels({
  lanes,
  plotH,
  svgH,
}: {
  lanes: readonly string[];
  plotH: number;
  svgH: number;
}) {
  const t = useT();
  const rows = Math.max(1, lanes.length);
  return (
    <div
      className="pointer-events-none absolute inset-x-0"
      style={{ top: `${(PAD_TOP / svgH) * 100}%`, height: `${(plotH / svgH) * 100}%` }}
    >
      {lanes.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="absolute left-1 max-w-[42%] truncate rounded-sm bg-ink-750/80 px-1 font-mono text-[10px] leading-none text-fg-3"
          style={{ top: `${((i + 0.5) / rows) * 100}%`, transform: "translateY(-50%)" }}
        >
          {name === OTHER_LANE
            ? t("viz.laneOther")
            : (PHASE_LANES as readonly string[]).includes(name)
              ? t(`phase.${name}` as MessageKey)
              : name}
        </span>
      ))}
    </div>
  );
}

/* ── hover 카드 ─────────────────────────────────────────────── */

function HoverCard({
  turn,
  index,
  atRatio,
}: {
  turn: Turn;
  index: number;
  atRatio: number;
}) {
  const t = useT();
  // 오른쪽 끝에서는 카드를 왼쪽으로 뒤집는다 — 안 그러면 화면 밖으로 나간다.
  const flip = atRatio > 0.62;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 w-[min(280px,72vw)] rounded-md border border-line bg-ink-800 px-3 py-2 shadow-md"
      style={
        flip
          ? { right: `${(1 - atRatio) * 100}%`, marginRight: 10 }
          : { left: `${atRatio * 100}%`, marginLeft: 10 }
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[11px] text-fg-3">
          {t("viz.turnN", { n: index })}
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: verdictColor(turn) }}
          aria-hidden
        />
        <span className="truncate text-xs font-medium">{turnTitle(turn, t)}</span>
      </div>
      {turn.call && (
        <p className="mt-1 truncate font-mono text-[10.5px] text-fg-3">{turn.call}</p>
      )}
      <dl className="mt-1.5 grid grid-cols-3 gap-x-2 border-t border-hair pt-1.5 font-mono text-[10.5px]">
        <Metric k={t("viz.mDuration")} v={fmtDuration(turn.durationMs, t)} />
        <Metric k={t("viz.mTokens")} v={turn.tokens.toLocaleString()} />
        <Metric k={t("viz.mRecords")} v={String(turn.recordsKnown)} />
      </dl>
      {turn.note && (
        <p className="mt-1.5 text-[10.5px] text-warn">{t(`failure.${turn.note.kind}`)}</p>
      )}
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-fg-2">{v}</dd>
    </div>
  );
}
