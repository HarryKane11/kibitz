import type { ObsType, Turn } from "@/lib/types";

/**
 * 관측 트리.
 *
 * `Turn[]` 은 평평하게 두고 계층은 `parentIndex` 로만 표현한다. 인덱스가 고정이라
 * 탐지 규칙·JourneyMap·스코어가 전부 그대로 동작하고, 트리는 화면에서 필요할 때만
 * 조립한다. 트리를 저장하면 같은 사실이 두 곳에 있게 되고 둘은 반드시 어긋난다.
 */

export interface Rollup {
  /** 자신 + 자손의 합 */
  durationMs: number;
  tokens: number;
  costUsd: number;
  errors: number;
  wastes: number;
  /** 자손 수 (자신 제외) */
  descendants: number;
}

export interface TreeNode {
  turn: Turn;
  children: TreeNode[];
  depth: number;
  rollup: Rollup;
}

const EMPTY: Rollup = {
  durationMs: 0,
  tokens: 0,
  costUsd: 0,
  errors: 0,
  wastes: 0,
  descendants: 0,
};

/** 트리를 만들고 각 노드에 자손 합계를 붙인다. 합계는 계산값이라 저장하지 않는다. */
export function buildTree(turns: Turn[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>();
  for (const turn of turns) {
    nodes.set(turn.index, { turn, children: [], depth: 0, rollup: { ...EMPTY } });
  }

  const roots: TreeNode[] = [];
  for (const turn of turns) {
    const node = nodes.get(turn.index)!;
    const parent = turn.parentIndex === undefined ? undefined : nodes.get(turn.parentIndex);
    // 부모가 자기 뒤에 있으면(있을 수 없지만) 사이클이 되므로 루트로 떨어뜨린다
    if (parent && parent.turn.index < turn.index) {
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  const fold = (node: TreeNode): Rollup => {
    const acc: Rollup = {
      durationMs: node.turn.durationMs,
      tokens: node.turn.tokens,
      costUsd: node.turn.costUsd,
      errors: node.turn.verdict === "error" ? 1 : 0,
      wastes: node.turn.verdict === "waste" ? 1 : 0,
      descendants: 0,
    };
    for (const child of node.children) {
      const r = fold(child);
      acc.durationMs += r.durationMs;
      acc.tokens += r.tokens;
      acc.costUsd += r.costUsd;
      acc.errors += r.errors;
      acc.wastes += r.wastes;
      acc.descendants += r.descendants + 1;
    }
    node.rollup = acc;
    return acc;
  };
  roots.forEach(fold);

  return roots;
}

/** 트리를 화면 순서(깊이 우선)로 편다. 접힌 노드의 자손은 건너뛴다. */
export function flattenTree(roots: TreeNode[], collapsed: ReadonlySet<number>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (!collapsed.has(n.turn.index)) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** 이 노드나 그 자손에 판정이 붙어 있는가 — 접힌 묶음에도 문제 배지를 띄우기 위해. */
export function hasProblem(node: TreeNode): boolean {
  return node.rollup.errors > 0 || node.rollup.wastes > 0;
}

/** 문제가 있는 노드로 가는 경로를 모두 펼친다. */
export function pathsToProblems(roots: TreeNode[]): Set<number> {
  const open = new Set<number>();
  const walk = (node: TreeNode, ancestors: number[]): void => {
    if (node.turn.note) ancestors.forEach((a) => open.add(a));
    node.children.forEach((c) => walk(c, [...ancestors, node.turn.index]));
  };
  roots.forEach((r) => walk(r, []));
  return open;
}

/**
 * 트레이스의 시간 범위. waterfall 의 x 축.
 *
 * 마지막 관측의 시작 + 지속시간이 끝이다. 오프셋만 보면 마지막 호출의
 * 길이가 잘려 축이 짧아진다.
 */
export function traceSpan(turns: Turn[]): { start: number; end: number } {
  let end = 0;
  for (const t of turns) end = Math.max(end, t.startOffsetMs + t.durationMs);
  return { start: 0, end: Math.max(1, end) };
}

/** 인자 해시가 직전과 같은 턴 → 경로 지도에서 되돌아가는 호를 그린다 */
export function findLoops(turns: Turn[]): { from: number; to: number }[] {
  const loops: { from: number; to: number }[] = [];
  for (let i = 1; i < turns.length; i++) {
    const h = turns[i].callHash;
    if (!h) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (turns[j].callHash === h) {
        loops.push({ from: i, to: j });
        break;
      }
    }
  }
  return loops;
}

/** 관측 종류별 글리프 색. 종류는 정체성이므로 무채색 + 한 칸만 강조한다. */
export const OBS_TINT: Record<ObsType, string> = {
  chain: "text-fg",
  llm: "text-fg-2",
  retriever: "text-fg-2",
  tool: "text-fg-2",
  agent: "text-fg-2",
  event: "text-fg-3",
};
