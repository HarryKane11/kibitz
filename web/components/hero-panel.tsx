"use client";

import Link from "next/link";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import type { Run } from "@/lib/types";
import { FAILURE_RULE } from "@/lib/types";
import { buildTree, type TreeNode } from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import { EvidenceList } from "@/components/viz";
import { fmtDuration, fmtTokens, fmtUsd, turnTitle } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 히어로 패널.
 *
 * LangSmith 랜딩은 제품 UI 스크린샷을 히어로로 쓴다. 우리는 **같은 자리에 실제
 * 컴포넌트를 렌더한다** — 스크린샷은 코드가 바뀌면 조용히 거짓이 되고, 그건
 * "숫자를 믿을 수 있다"를 파는 제품이 제일 하면 안 되는 일이다.
 *
 * 앱의 트리를 그대로 쓰지 않고 좁은 폭에 맞춘 정적 렌더를 따로 둔다 — 랜딩에서
 * 접기·선택 같은 상호작용은 쓸 데가 없고, 상태를 들고 오면 그만큼 무거워진다.
 */
export function HeroPanel({ run }: { run: Run }) {
  const t = useT();

  const roots = buildTree(run.turns);
  // 판정이 걸린 묶음을 고른다 — 아무 일도 없는 묶음을 보여주면 제품 설명이 안 된다.
  const group =
    roots.find((r) => r.rollup.errors + r.rollup.wastes >= 2) ?? roots[0];
  const rows: TreeNode[] = [group, ...group.children].slice(0, 9);
  const flagged = group.children.find((c) => c.turn.note)?.turn;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-800">
      <div className="flex items-center gap-2 border-b border-hair px-4 py-2.5">
        <span className="font-mono text-[11px] text-fg-3">
          {t("landing.heroPanel", { run: run.id })}
        </span>
        <Link
          href={`/traces/${run.id}/timeline`}
          className="ml-auto flex items-center gap-1 text-[11px] text-fg-3 transition-colors duration-100 hover:text-fg-2"
        >
          {t("traces.openTimeline")}
          <ArrowUpRight className="h-2.5 w-2.5" aria-hidden />
        </Link>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 좌: 트리 */}
        <ul className="border-b border-hair py-1.5 lg:border-r lg:border-b-0">
          {rows.map((n) => {
            const bad = n.turn.verdict === "error" || n.turn.verdict === "waste";
            return (
              <li
                key={n.turn.index}
                className={cn(
                  "flex items-center gap-2 py-1 pr-3 text-[13.5px]",
                  n.turn.index === flagged?.index && "bg-ink-600",
                )}
                style={{ paddingLeft: 12 + n.depth * 14 }}
              >
                {bad && (
                  <TriangleAlert
                    className={cn(
                      "h-3 w-3 shrink-0",
                      n.turn.verdict === "error" ? "text-crit" : "text-warn",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "truncate",
                    n.depth === 0 ? "font-medium text-fg" : "text-fg-2",
                    bad && "pl-0",
                  )}
                >
                  {turnTitle(n.turn, t)}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-fg-3">
                  {fmtDuration(n.rollup.durationMs, t)}
                </span>
              </li>
            );
          })}
          <li className="px-3 pt-2 font-mono text-[10.5px] text-fg-3">
            {t("traces.groupCount", { n: roots.length })} ·{" "}
            {t("traces.obsCount", { n: run.turns.length })} ·{" "}
            {fmtTokens(run.totalTokens)} · {fmtUsd(run.costUsd)}
          </li>
        </ul>

        {/* 우: 그 판정의 근거 — 이게 이 제품의 요점이다 */}
        <div className="px-4 py-3.5">
          {flagged?.note ? (
            <>
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase",
                  flagged.verdict === "waste" ? "text-warn" : "text-crit",
                )}
              >
                <TriangleAlert className="h-3 w-3" aria-hidden />
                {t(`failure.${flagged.note.kind}`)}
              </p>
              <h3 className="mt-1.5 text-sm font-semibold">
                {t(`note.${flagged.note.kind}`)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
                {t(`why.${flagged.note.kind}`)}
              </p>

              <p className="mt-3 mb-1.5 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
                {t("failure.observed")}
              </p>
              <EvidenceList items={flagged.note.evidence} />
              <p className="mt-2 font-mono text-[10.5px] break-all text-fg-3">
                {t("failure.rule")} · {FAILURE_RULE[flagged.note.kind]}
              </p>
            </>
          ) : (
            <p className="text-sm text-fg-3">{t("traces.noVerdicts")}</p>
          )}
        </div>
      </div>

      <p className="border-t border-hair px-4 py-2.5 text-xs text-fg-3">
        {t("landing.heroPanelHint")}
      </p>
    </div>
  );
}
