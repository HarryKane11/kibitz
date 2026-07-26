"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Braces,
  ChevronRight,
  Flag,
  MessageSquare,
  Search,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { ObsType, Turn } from "@/lib/types";
import {
  buildTree,
  flattenTree,
  pathsToProblems,
  traceSpan,
  type TreeNode,
} from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import { fmtDuration, fmtTokens, turnTitle } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 관측 트리.
 *
 * LangSmith 의 run tree 와 같은 형태다: 좌측에 중첩 트리, 우측에 지연/토큰 또는
 * waterfall. 사용자 요청 하나가 묶음의 뿌리이므로 160턴 런도 6줄로 접힌다 —
 * 긴 런의 스크롤 지옥이 여기서 사라진다.
 *
 * 애니메이션이 없다. 트리 네비게이션은 하루에 수백 번 하는 동작이고,
 * 그런 곳의 트랜지션은 도움이 아니라 지연이다.
 */

const ICON: Record<ObsType, typeof Wrench> = {
  chain: MessageSquare,
  llm: Braces,
  retriever: Search,
  tool: Wrench,
  agent: Bot,
  event: Flag,
};

export type TreeMode = "tree" | "waterfall";
export type TreeScope = "all" | "problems";

export function RunTree({
  turns,
  selected,
  onSelect,
  mode,
  scope,
}: {
  turns: Turn[];
  selected: number;
  onSelect: (index: number) => void;
  mode: TreeMode;
  scope: TreeScope;
}) {
  const t = useT();
  const roots = useMemo(() => buildTree(turns), [turns]);
  const span = useMemo(() => traceSpan(turns), [turns]);

  // 기본은 전부 펼침. 접기는 사용자가 한다 — 처음부터 접혀 있으면
  // 무엇이 있는지 모른 채 열어봐야 한다.
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  const rows = useMemo(() => {
    const flat = flattenTree(roots, collapsed);
    if (scope === "all") return flat;
    // 문제만: 판정이 붙은 노드와 그 조상만 남긴다. 조상이 없으면 맥락이 사라진다.
    const keep = pathsToProblems(roots);
    return flat.filter((n) => n.turn.note || keep.has(n.turn.index));
  }, [roots, collapsed, scope]);

  const toggle = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!rows.length) {
    return <p className="px-3 py-6 text-sm text-fg-3">{t("traces.noVerdicts")}</p>;
  }

  return (
    <ul className="py-1" role="tree" aria-label={t("traces.timeline")}>
      {rows.map((node) => (
        <Row
          key={node.turn.index}
          node={node}
          selected={node.turn.index === selected}
          collapsed={collapsed.has(node.turn.index)}
          onSelect={() => onSelect(node.turn.index)}
          onToggle={() => toggle(node.turn.index)}
          mode={mode}
          span={span}
        />
      ))}
    </ul>
  );
}

function Row({
  node,
  selected,
  collapsed,
  onSelect,
  onToggle,
  mode,
  span,
}: {
  node: TreeNode;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
  mode: TreeMode;
  span: { start: number; end: number };
}) {
  const t = useT();
  const { turn, depth, rollup, children } = node;
  const Icon = ICON[turn.obsType];
  const hasKids = children.length > 0;
  const bad = turn.verdict === "error" || turn.verdict === "waste";
  // 접혀 있으면 자손의 문제를 이 줄에 끌어올린다 — 접었다고 문제가 사라지면 안 된다.
  const hidden = collapsed && (rollup.errors > 0 || rollup.wastes > 0);

  const left = (turn.startOffsetMs / span.end) * 100;
  // 0ms 관측(사건)도 보여야 하므로 최소 폭을 준다
  const width = Math.max(0.6, (turn.durationMs / span.end) * 100);

  return (
    <li
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasKids ? !collapsed : undefined}
    >
      <div
        className={cn(
          "group relative flex items-center gap-1.5 py-[3px] pr-3 text-sm",
          selected ? "bg-ink-600" : "hover:bg-hover",
        )}
        style={{ paddingLeft: 8 + depth * 15 }}
      >
        {selected && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-sky" />
        )}

        {/* 인덴트 가이드 — 깊이가 2단뿐이라 세로선 하나로 충분하다 */}
        {depth > 0 && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-fill"
            style={{ left: 8 + (depth - 1) * 15 + 6 }}
          />
        )}

        <button
          onClick={onToggle}
          aria-label={collapsed ? t("common.showMore") : t("common.showLess")}
          tabIndex={hasKids ? 0 : -1}
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded text-fg-3",
            hasKids ? "hover:bg-fill hover:text-fg-2" : "invisible",
          )}
        >
          <ChevronRight
            className={cn("h-3 w-3", !collapsed && "rotate-90")}
            aria-hidden
          />
        </button>

        <button
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              bad ? (turn.verdict === "error" ? "text-crit" : "text-warn") : "text-fg-3",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "truncate",
              turn.obsType === "chain" ? "font-medium text-fg" : "text-fg-2",
            )}
          >
            {turnTitle(turn, t)}
          </span>

          {(bad || hidden) && (
            <TriangleAlert
              className={cn(
                "h-3 w-3 shrink-0",
                turn.verdict === "waste" && !hidden ? "text-warn" : "text-crit",
              )}
              aria-label={t(`verdict.${turn.verdict === "waste" ? "waste" : "error"}`)}
            />
          )}
          {collapsed && hasKids && (
            <span className="shrink-0 rounded-full border border-line px-1.5 text-[10.5px] text-fg-3">
              {rollup.descendants + 1}
            </span>
          )}
        </button>

        {mode === "tree" ? (
          <span className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-fg-3">
            {rollup.tokens > 0 && <span>{fmtTokens(rollup.tokens)}</span>}
            <span className="w-12 text-right">{fmtDuration(rollup.durationMs, t)}</span>
          </span>
        ) : (
          <span className="relative h-3.5 w-[42%] shrink-0 rounded-sm bg-fill">
            <span
              className={cn(
                "absolute inset-y-0 rounded-sm",
                turn.verdict === "error"
                  ? "bg-crit/70"
                  : turn.verdict === "waste"
                    ? "bg-warn/70"
                    : turn.obsType === "chain"
                      ? "bg-fill-2"
                      : "bg-sky/45",
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${fmtDuration(turn.durationMs, t)} @ +${fmtDuration(turn.startOffsetMs, t)}`}
            />
          </span>
        )}
      </div>
    </li>
  );
}
