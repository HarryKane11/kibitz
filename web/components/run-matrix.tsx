"use client";

import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { fmtUsd } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 실행 비교 매트릭스.
 *
 * 열이 실행, 행이 항목. 같은 항목이 실행마다 어떻게 달라졌는지가 한 화면에 있어야
 * "이 프롬프트 변경이 무엇을 깨뜨렸나"를 답할 수 있다.
 *
 * 칸 색은 **순차 램프** 한 색상이다 — 점수는 크기(magnitude)지 정체성이 아니므로
 * 카테고리 색을 쓰면 안 된다. 실패한 칸만 상태색을 받는다.
 */
export function RunMatrix({ dataset }: { dataset: Dataset }) {
  const t = useT();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const runs = dataset.runs;
  // 기준은 기본으로 첫 실행이다. LangSmith 처럼 무엇이 움직였는지가 핵심 질문이므로
  // 비교 대상이 없는 화면은 "점수 표"일 뿐이고 실험 화면이 아니다.
  const [baseline, setBaseline] = useState(runs[0]?.id ?? "");

  const base = useMemo(() => {
    const run = runs.find((r) => r.id === baseline);
    return new Map((run?.items ?? []).map((i) => [i.itemId, i.score]));
  }, [runs, baseline]);

  /** 기준 대비 개선·회귀 집계. 같은 항목끼리만 비교한다. */
  const delta = useMemo(() => {
    const out = new Map<string, { up: number; down: number }>();
    for (const run of runs) {
      if (run.id === baseline) continue;
      let up = 0;
      let down = 0;
      for (const item of run.items) {
        const b = base.get(item.itemId);
        if (b === undefined) continue;
        if (item.score > b) up++;
        else if (item.score < b) down++;
      }
      out.set(run.id, { up, down });
    }
    return out;
  }, [runs, baseline, base]);

  if (!runs.length) return null;

  /**
   * 칸 색.
   *
   * 원색을 그대로 깔면 밝은 끝에서 흰 글자가 3:1 아래로 떨어진다. 표면색과
   * 55% 로 섞어 명도 단조성은 유지하면서 대비를 확보한다 (검증: 최저 6.6:1).
   * 글자는 항상 텍스트 토큰을 입는다 — 시리즈 색을 글자에 칠하지 않는다.
   */
  const cell = (score: number, passed: boolean) => {
    const tint = passed
      ? `var(--color-seq-${Math.min(4, Math.max(0, Math.floor(score * 5) - 1)) + 1})`
      : "var(--color-crit)";
    return `color-mix(in oklab, ${tint} 55%, var(--color-ink-800))`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-ink-900 px-3 py-2 text-left text-xs font-medium tracking-wide text-fg-3 uppercase">
              {t("datasets.input")}
            </th>
            {runs.map((r) => {
              const d = delta.get(r.id);
              const isBase = r.id === baseline;
              return (
                <th key={r.id} className="px-2 py-2 text-left align-bottom">
                  <button
                    onClick={() => setBaseline(r.id)}
                    aria-pressed={isBase}
                    title={t("datasets.baseline")}
                    className="block max-w-full text-left"
                  >
                    <span
                      className={cn(
                        "block truncate text-xs font-medium",
                        isBase ? "text-fg" : "text-fg-2 hover:text-fg",
                      )}
                    >
                      {r.name}
                    </span>
                  </button>
                  <span className="mt-0.5 block text-[11px] font-normal text-fg-3">
                    {r.passRate}% · {fmtUsd(r.totalCostUsd)}
                  </span>
                  {isBase ? (
                    <span className="mt-1 inline-block rounded-full border border-line-2 px-1.5 text-[10.5px] text-fg-2">
                      {t("datasets.baseline")}
                    </span>
                  ) : (
                    d && (
                      <span className="mt-1 flex gap-2 text-[10.5px]">
                        <span className={d.up > 0 ? "text-fg-2" : "text-fg-3"}>
                          ▲ {d.up}
                        </span>
                        <span className={d.down > 0 ? "text-crit" : "text-fg-3"}>
                          ▼ {d.down}
                        </span>
                      </span>
                    )
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {dataset.items.map((item, ri) => (
            <tr key={item.id}>
              <td className="sticky left-0 z-10 max-w-[280px] truncate bg-ink-900 px-3 py-1.5 text-fg-2">
                {item.input}
              </td>
              {runs.map((run, ci) => {
                const ri2 = run.items.find((x) => x.itemId === item.id);
                if (!ri2) return <td key={run.id} className="px-2 py-1.5" />;
                const on = hover?.r === ri && hover?.c === ci;
                return (
                  <td key={run.id} className="relative px-1 py-1">
                    <div
                      onMouseEnter={() => setHover({ r: ri, c: ci })}
                      onMouseLeave={() => setHover(null)}
                      className="flex h-8 cursor-default items-center justify-center gap-1.5 rounded-[4px] font-mono text-xs text-fg transition-opacity"
                      style={{
                        background: cell(ri2.score, ri2.passed),
                        opacity: hover && !on ? 0.55 : 1,
                      }}
                    >
                      {ri2.score.toFixed(2)}
                      {/* 기준 대비 변화. 칸 안에 나란히 둔다 — 위에 겹치면 둘 다 안 읽힌다.
                          같은 항목의 기준값이 있을 때만 말한다. */}
                      {run.id !== baseline &&
                        (() => {
                          const b = base.get(item.id);
                          if (b === undefined || b === ri2.score) return null;
                          const diff = ri2.score - b;
                          return (
                            <span className="text-[10px] text-fg/70">
                              {diff > 0 ? "▲" : "▼"}
                              {Math.abs(diff).toFixed(2)}
                            </span>
                          );
                        })()}
                    </div>
                    {on && (
                      <div className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 w-64 -translate-x-1/2 rounded-md border border-line bg-ink-700 px-3 py-2 shadow-lg">
                        <p className="mb-1 text-[11px] text-fg-3">
                          {t("datasets.actualOutput")}
                        </p>
                        <p className="font-mono text-xs break-words text-fg-2">
                          {ri2.actualOutput}
                        </p>
                        <p className="mt-1.5 text-[11px] text-fg-3">
                          {ri2.latencyMs}ms · {fmtUsd(ri2.costUsd)}
                        </p>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1.5 text-xs text-fg-2">
          <span
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: cell(0, false) }}
            aria-hidden
          />
          {t("datasets.legendFailed")}
        </li>
        <li className="flex items-center gap-1.5 text-xs text-fg-2">
          <span className="flex" aria-hidden>
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="h-2.5 w-2.5"
                style={{ background: cell(i / 5, true) }}
              />
            ))}
          </span>
          {t("datasets.legendScale")}
        </li>
      </ul>

      <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-fg-3">
        {t("datasets.regressionNote")}
      </p>
    </div>
  );
}
