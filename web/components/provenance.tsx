"use client";

import type { NumberClaim, Turn } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { turnTitle } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 출처 추적.
 *
 * 최종 답변에서 뽑은 숫자 리터럴 각각을, 그 값이 처음 등장한 턴으로 잇는다.
 * 선이 없는 숫자가 곧 출처 없는 주장이다.
 *
 * 판정에 모델을 쓰지 않는다 — 문자열 대조뿐이다.
 * 그래서 좁지만(숫자·인용문만) 틀리지 않는다.
 */

const W = 1000;
const H = 132;
const PAD_X = 26;
const CHIP_Y = 24;
const CHIP_H = 26;
const AXIS_Y = 104;

export function Provenance({
  claims,
  turns,
  onSelect,
  className,
}: {
  claims: NumberClaim[];
  turns: Turn[];
  onSelect?: (i: number) => void;
  className?: string;
}) {
  const t = useT();
  const step = (W - PAD_X * 2) / Math.max(1, turns.length - 1);
  const turnX = (i: number) => PAD_X + i * step;

  // 칩은 위쪽에 균등 배치한다. 아래 축은 경로 지도와 같은 x 스케일을 쓴다.
  const slot = (W - PAD_X * 2) / claims.length;
  const chipX = (k: number) => PAD_X + slot * (k + 0.5);
  const chipW = (text: string) => Math.max(52, text.length * 9 + 22);

  const unsourced = claims.filter((c) => c.sourceTurn === null).length;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[132px] w-full"
        role="img"
        aria-label={t("viz.provenanceAria")}
      >
        {/* 턴 축 */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={AXIS_Y}
          y2={AXIS_Y}
          stroke="var(--line)"
          strokeWidth={1}
        />
        {turns.map((turn, i) => (
          <g key={turn.index} onClick={() => onSelect?.(i)} className={onSelect ? "cursor-pointer" : undefined}>
            <circle cx={turnX(i)} cy={AXIS_Y} r={2.4} fill="var(--fill-2)" />
            <title>
              {t("viz.provenanceTooltip", { i, title: turnTitle(turn, t) })}
            </title>
          </g>
        ))}

        {/* 연결선 */}
        {claims.map((c, k) => {
          const cx = chipX(k);
          const top = CHIP_Y + CHIP_H;
          if (c.sourceTurn === null) {
            // 출처 없음 — 아래로 뻗다가 끊긴다
            return (
              <g key={c.text}>
                <path
                  d={`M${cx} ${top} L${cx} ${AXIS_Y - 22}`}
                  stroke="var(--color-crit)"
                  strokeWidth={1.4}
                  strokeDasharray="3 4"
                  fill="none"
                />
                <line
                  x1={cx - 5}
                  x2={cx + 5}
                  y1={AXIS_Y - 20}
                  y2={AXIS_Y - 10}
                  stroke="var(--color-crit)"
                  strokeWidth={1.6}
                />
                <line
                  x1={cx + 5}
                  x2={cx - 5}
                  y1={AXIS_Y - 20}
                  y2={AXIS_Y - 10}
                  stroke="var(--color-crit)"
                  strokeWidth={1.6}
                />
              </g>
            );
          }
          const tx = turnX(c.sourceTurn);
          const mid = (top + AXIS_Y) / 2;
          return (
            <path
              key={c.text}
              d={`M${cx} ${top} C ${cx} ${mid}, ${tx} ${mid}, ${tx} ${AXIS_Y - 4}`}
              stroke="var(--color-sky)"
              strokeOpacity={0.5}
              strokeWidth={1.3}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* 숫자 칩 */}
        {claims.map((c, k) => {
          const cx = chipX(k);
          const w = chipW(c.text);
          const bad = c.sourceTurn === null;
          return (
            <g key={`chip-${c.text}`}>
              <rect
                x={cx - w / 2}
                y={CHIP_Y}
                width={w}
                height={CHIP_H}
                rx={6}
                fill={bad ? "rgb(229 72 77 / 14%)" : "var(--hover)"}
                stroke={bad ? "var(--color-crit)" : "var(--line)"}
                strokeWidth={1}
              />
              <text
                x={cx}
                y={CHIP_Y + 17}
                textAnchor="middle"
                className={bad ? "fill-crit" : "fill-fg"}
                style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-mono)" }}
              >
                {c.text}
              </text>
              {bad && (
                <text
                  x={cx}
                  y={AXIS_Y + 16}
                  textAnchor="middle"
                  className="fill-crit"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {t("viz.noSource")}
                </text>
              )}
              {!bad && (
                <text
                  x={turnX(c.sourceTurn!)}
                  y={AXIS_Y + 16}
                  textAnchor="middle"
                  className="fill-fg-3"
                  style={{ fontSize: 11 }}
                >
                  {t("viz.fromTurn", { n: c.sourceTurn! })}
                </text>
              )}
            </g>
          );
        })}

        <text x={PAD_X} y={14} className="fill-fg-3" style={{ fontSize: 11 }}>
          {t("viz.claimCount", { n: claims.length })}
        </text>
      </svg>

      {unsourced > 0 && (
        <p className="mt-1 rounded-r-sm border-l-2 border-crit bg-crit/[0.055] px-3 py-2.5 text-sm leading-relaxed text-fg-2">
          {t("viz.claimNote", { n: claims.length })}{" "}
          <b className="font-semibold text-fg">{t("viz.claimUnsourced", { n: unsourced })}</b>{" "}
          {t("viz.claimNoModel")}
        </p>
      )}
    </div>
  );
}
