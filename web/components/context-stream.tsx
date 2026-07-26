"use client";

import type { ContextRole, Turn } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * 컨텍스트 스트림.
 *
 * 턴에 걸친 컨텍스트 창 구성을 누적 영역으로 그린다.
 * 턴별 막대는 "지금 이 순간"만 보여주지만, 스트림은 **밀려나는 과정**을 보여준다.
 * 조회 결과가 부풀며 히스토리 띠가 짓눌리는 것이 곧 컨텍스트 절단이다.
 *
 * 모든 값은 실제 전송된 messages 를 역할별로 합산한 토큰이다.
 */

const W = 1000;
const H = 150;
const PAD_X = 26;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

/**
 * 무채색 계단. 툴 정의만 색을 얻는다 — 대부분이 안 쓰이는 죽은 무게라서.
 *
 * 밝기 배치가 중요하다: **짓눌리는 쪽(대화 히스토리)을 가장 밝게** 두고,
 * 밀어내는 쪽(조회 결과)을 어둡게 둔다. 그래야 밝은 띠가 어두운 덩어리에
 * 먹히는 장면으로 읽힌다. 반대로 두면 정작 볼 것이 묻힌다.
 */
const FILL: Record<ContextRole, string> = {
  system: "#262B33",
  skills: "#2F353D",
  tools: "rgb(217 164 65 / 30%)",
  history: "#7B8794",
  retrieval: "#3A424C",
  cacheRead: "#2F353D",
  cacheWrite: "#3A424C",
  freshInput: "#7B8794",
  output: "#4A525D",
};

export function ContextStream({
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
  // 밴드는 데이터가 정한다. 목 런은 역할별로, 실측 런은 캐시 계층으로 쪼개지므로
  // 고정 목록을 두면 범례가 그림과 어긋난다 — 실제로 어긋났었다.
  const bands = (turns[0]?.context ?? []).map((c) => c.label);
  const totals = turns.map((x) => x.context.reduce((a, c) => a + c.tokens, 0));
  const max = Math.max(1, ...totals);
  const step = (W - PAD_X * 2) / Math.max(1, turns.length - 1);
  const x = (i: number) => PAD_X + i * step;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);

  // 각 밴드의 누적 상단선을 만든다
  const stacks = turns.map((turn) => {
    let acc = 0;
    return turn.context.map((c) => {
      acc += c.tokens;
      return acc;
    });
  });

  const areaFor = (bandIdx: number) => {
    const top = turns.map((_, i) => `${x(i)} ${y(stacks[i][bandIdx])}`);
    const bottom = turns
      .map((_, i) => {
        const below = bandIdx === 0 ? 0 : stacks[i][bandIdx - 1];
        return `${x(i)} ${y(below)}`;
      })
      .reverse();
    return `M${top.join(" L")} L${bottom.join(" L")} Z`;
  };

  // 히스토리 토큰이 줄어든 지점 = 절단
  const evictions = turns
    .map((turn, i) => {
      if (i === 0) return null;
      const prev = turns[i - 1].context.find((c) => c.label === "history")?.tokens ?? 0;
      const cur = turn.context.find((c) => c.label === "history")?.tokens ?? 0;
      return cur < prev ? { i, prev, cur } : null;
    })
    .filter(Boolean) as { i: number; prev: number; cur: number }[];

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[150px] w-full"
        role="img"
        aria-label={t("viz.contextAria")}
      >
        {bands.map((role, bi) => (
          <path
            key={role}
            d={areaFor(bi)}
            fill={FILL[role]}
            stroke="var(--color-ink-750)"
            strokeWidth={0.8}
          />
        ))}

        {/* 절단 지점 */}
        {evictions.map((e) => (
          <g key={e.i}>
            <line
              x1={x(e.i)}
              x2={x(e.i)}
              y1={PAD_TOP}
              y2={H - PAD_BOTTOM}
              stroke="var(--color-crit)"
              strokeWidth={1.4}
              strokeDasharray="3 3"
            />
            <text
              x={x(e.i) - 6}
              y={PAD_TOP + 12}
              textAnchor="end"
              className="fill-crit"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              {t("viz.historyDrop", {
                prev: e.prev.toLocaleString(),
                cur: e.cur.toLocaleString(),
              })}
            </text>
          </g>
        ))}

        {/* 선택 표시 + 히트 영역 */}
        {turns.map((turn, i) => (
          <g key={turn.index} onClick={() => onSelect?.(i)} className={onSelect ? "cursor-pointer" : undefined}>
            <rect x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" />
            {i === selected && (
              <line
                x1={x(i)}
                x2={x(i)}
                y1={PAD_TOP}
                y2={H - PAD_BOTTOM}
                stroke="var(--color-sky)"
                strokeWidth={1.5}
              />
            )}
            <title>{t("viz.contextTooltip", { i, tokens: totals[i].toLocaleString() })}</title>
          </g>
        ))}

        <text x={PAD_X} y={H - 8} className="fill-fg-3" style={{ fontSize: 11 }}>
          {t("viz.turnZero")}
        </text>
        <text
          x={W - PAD_X}
          y={H - 8}
          textAnchor="end"
          className="fill-fg-3"
          style={{ fontSize: 11 }}
        >
          {t("viz.turnMax", { n: turns.length - 1, tokens: max.toLocaleString() })}
        </text>
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {bands.map((role) => (
          <li key={role} className="flex items-center gap-2 text-xs text-fg-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: FILL[role] }} />
            {t(`context.${role}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
