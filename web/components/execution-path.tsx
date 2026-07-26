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

export type Lens = "path" | "flame" | "tokens";

const LENSES: { id: Lens; label: MessageKey; hint: MessageKey }[] = [
  { id: "path", label: "viz.lensPath", hint: "viz.lensPathHint" },
  { id: "flame", label: "viz.lensFlame", hint: "viz.lensFlameHint" },
  { id: "tokens", label: "viz.lensTokens", hint: "viz.lensTokensHint" },
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
    return t("viz.axisDepth");
  }, [lens, view, t]);

  const hovered = hover !== null ? turns[hover] : null;
  const active = hovered ?? (selected !== undefined ? turns[selected] : null);

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
          viewBox={`0 0 ${W} ${H}`}
          className={cn("block h-[190px] w-full", drag ? "cursor-col-resize" : "cursor-crosshair")}
          role="img"
          aria-label={t("viz.pathAria")}
        >
          {lens === "path" && (
            <PathLens turns={turns} view={view} lo={lo} x={xIndex} step={step} />
          )}
          {lens === "flame" && <FlameLens view={view} x={xTime} />}
          {lens === "tokens" && <TokensLens view={view} x={xIndex} step={step} />}

          {/* 선택·hover 표시는 렌즈 위에 공통으로 얹는다 */}
          {selected !== undefined && selected >= lo && selected <= hi && (
            <line
              x1={lens === "flame" ? xTime(turns[selected].startOffsetMs) : xIndex(selected - lo)}
              x2={lens === "flame" ? xTime(turns[selected].startOffsetMs) : xIndex(selected - lo)}
              y1={PAD_TOP - 6}
              y2={H - PAD_BOTTOM + 6}
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
              y2={H - PAD_BOTTOM + 6}
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
              height={PLOT_H + 12}
              fill="var(--color-sky)"
              fillOpacity={0.12}
              stroke="var(--color-sky)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

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

      {active && (
        <p className="mt-1 truncate text-[11px] text-fg-3">
          {t("viz.turnN", { n: hovered ? hover! : selected! })} · {turnTitle(active, t)}
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
  const rowH = Math.min(26, PLOT_H / rows);

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
        <span className="font-mono text-[11px] text-fg-3">
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
