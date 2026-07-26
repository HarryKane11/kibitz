"use client";

import { useMemo } from "react";
import type { Turn } from "@/lib/types";
import { findLoops } from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import { turnTitle } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 경로 지도.
 *
 * 막대 나열 대신 에이전트가 실제로 지나간 길을 선으로 그린다.
 *
 * - 세로축 = 이 턴까지 확보한 **고유 레코드 수** (계측값)
 *   지어낸 진행도 점수가 아니다. 헛돌면 선이 평평해진다.
 * - 같은 인자 해시로 다시 부른 턴은 **되돌아가는 호**로 잇는다.
 *   "돌고 있다"를 설명하는 대신 보여준다.
 * - 아무것도 얻지 못한 구간은 점선으로 떨어뜨린다.
 */

const W = 1000;
const H = 188;
const PAD_X = 26;
const PAD_TOP = 26;
const PAD_BOTTOM = 62; // 아래쪽은 되돌아가는 호가 쓴다

export function JourneyMap({
  turns,
  selected,
  onSelect,
  className,
}: {
  turns: Turn[];
  selected?: number;
  onSelect?: (i: number) => void;
  className?: string;
}) {
  const t = useT();
  const loops = useMemo(() => findLoops(turns), [turns]);

  // 라벨은 가장 폭이 넓은 호 하나에만 붙인다
  const labelled = loops.reduce(
    (best, l, i, arr) =>
      Math.abs(l.from - l.to) > Math.abs(arr[best].from - arr[best].to) ? i : best,
    0,
  );

  const maxRecords = Math.max(1, ...turns.map((t) => t.recordsKnown));
  const step = (W - PAD_X * 2) / Math.max(1, turns.length - 1);
  const x = (i: number) => PAD_X + i * step;
  const y = (v: number) =>
    PAD_TOP + (1 - v / maxRecords) * (H - PAD_TOP - PAD_BOTTOM);

  // 실측 런은 160턴이다. 턴마다 원을 그리면 6px 간격에 반경 8px 원이 겹쳐
  // 애벌레가 되고 무엇도 읽히지 않는다. 선은 전부 그려 연속성을 지키고,
  // **원은 솎아낸다** — 단 판정이 붙은 턴은 절대 빠뜨리지 않는다.
  const dense = step < 9;
  const every = Math.max(1, Math.ceil(9 / Math.max(step, 0.5)));
  const scale = dense ? 0.55 : 1;

  const nodes = turns.map((t, i) => ({
    t,
    i,
    cx: x(i),
    cy: y(t.recordsKnown),
    // 노드 크기 = 이 턴이 쓴 토큰. 비싼 턴이 물리적으로 크다.
    r: (3.2 + Math.min(5.2, Math.sqrt(t.tokens) / 26)) * scale,
    // 그릴지 여부. 문제·사람 개입·양 끝은 항상 그린다.
    shown:
      !dense ||
      t.verdict !== "good" ||
      i === 0 ||
      i === turns.length - 1 ||
      i % every === 0,
  }));

  const segments = nodes.slice(1).map((n, k) => {
    const prev = nodes[k];
    return {
      key: n.i,
      d: `M${prev.cx} ${prev.cy} L${n.cx} ${n.cy}`,
      // 새로 얻은 게 없으면 죽은 구간
      dead: n.t.recordsKnown === prev.t.recordsKnown,
    };
  });

  const strokeFor = (t: Turn) =>
    t.verdict === "error"
      ? "var(--color-crit)"
      : t.verdict === "waste"
        ? "var(--color-warn)"
        : t.verdict === "human"
          ? "var(--color-turn-wait)"
          : "var(--color-turn-good)";

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[188px] w-full"
        role="img"
        aria-label={t("viz.pathAria")}
      >
        {/* 바닥선 — 레코드 0 */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--hair)"
          strokeWidth={1}
        />

        {/* 되돌아가는 호 — 같은 인자로 다시 부른 지점.
            실제 런에서는 이게 여러 개 겹친다. 라벨을 전부 그리면 서로 덮어써
            아무것도 안 읽히므로, 가장 넓은 호 하나에만 붙이고 나머지는 수로 말한다. */}
        {loops.map((l, li) => {
          const from = x(l.from);
          const to = x(l.to);
          const base = y(turns[l.from].recordsKnown);
          const depth = 30;
          return (
            <g key={`${l.from}-${l.to}`}>
              <path
                d={`M${from} ${base + 5} C ${from} ${base + depth}, ${to} ${base + depth}, ${to} ${base + 5}`}
                fill="none"
                stroke="var(--color-crit)"
                strokeWidth={1.4}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              {li === labelled && (
                <text
                  x={(from + to) / 2}
                  y={base + depth + 13}
                  textAnchor="middle"
                  className="fill-crit"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {t("traces.loopLabel")}
                  {loops.length > 1 ? ` · ${t("traces.loopCount", { n: loops.length })}` : ""}
                </text>
              )}
            </g>
          );
        })}

        {/* 경로 */}
        {segments.map((s) => (
          <path
            key={s.key}
            d={s.d}
            fill="none"
            stroke={s.dead ? "var(--line-2)" : "var(--color-sky)"}
            strokeWidth={s.dead ? 1.2 : 1.8}
            strokeDasharray={s.dead ? "4 4" : undefined}
            strokeOpacity={s.dead ? 1 : 0.75}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* 노드 */}
        {nodes.filter((n) => n.shown).map((n) => {
          const isSel = n.i === selected;
          return (
            <g
              key={n.i}
              onClick={() => onSelect?.(n.i)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              {/* 히트 영역 */}
              <rect
                x={n.cx - step / 2}
                y={0}
                width={step}
                height={H - PAD_BOTTOM + 20}
                fill="transparent"
              />
              {isSel && (
                <circle cx={n.cx} cy={n.cy} r={n.r + 4.5} fill="none" stroke="var(--color-sky)" strokeWidth={1.5} />
              )}
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.r}
                fill={strokeFor(n.t)}
                stroke="var(--color-ink-750)"
                strokeWidth={1.5}
              />
              {/* 사람 개입은 형태로 구분한다 — 색을 쓰지 않기 위해 */}
              {n.t.verdict === "human" && (
                <rect
                  x={n.cx - 1}
                  y={n.cy - 11}
                  width={2}
                  height={9}
                  fill="var(--color-fg-3)"
                />
              )}
              <title>
                {`${t("viz.pathTooltip", { i: n.i, title: turnTitle(n.t, t) })}\n${t(
                  "viz.pathTooltipMeta",
                  { records: n.t.recordsKnown, tokens: n.t.tokens.toLocaleString() },
                )}`}
              </title>
            </g>
          );
        })}

        {/* 세로축 라벨 */}
        <text x={PAD_X} y={PAD_TOP - 10} className="fill-fg-3" style={{ fontSize: 11 }}>
          {t("viz.recordsMax", { n: maxRecords })}
        </text>
        <text x={PAD_X} y={y(0) + 15} className="fill-fg-3" style={{ fontSize: 11 }}>
          {t("viz.zero")}
        </text>
      </svg>
    </div>
  );
}
