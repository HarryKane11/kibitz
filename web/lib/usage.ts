import type { Run, Turn } from "@/lib/types";

/**
 * 사용량 집계 — 토큰이 어디로 갔는가.
 *
 * "주로 어떤 작업을 하나"에 답하려면 작업을 분류해야 한다. 여기서 **모델에게 묻지
 * 않는다** — 그러면 이 제품이 하지 않기로 한 것을 하게 되고, 그 분류는 검증할 수
 * 없다. 대신 **부른 도구로 정한다**: 편집 도구에 토큰이 몰린 런은 코드를 쓴 것이고,
 * 읽기·검색에 몰린 런은 코드를 읽은 것이다. 규칙이 한 줄이고 화면에 그대로 쓴다.
 *
 * 도구 이름은 에이전트마다 다르므로(Claude Code 는 `Edit`, Codex 는 `apply_patch`)
 * 이름 목록이 아니라 **소문자 부분 문자열**로 맞춘다. 목록 방식은 새 도구가 생길
 * 때마다 조용히 `기타` 로 떨어지고, 그러면 합계가 맞는데 분류가 틀린다.
 */

export type WorkKind = "write" | "read" | "execute" | "delegate" | "converse" | "other";

export const WORK_KINDS: WorkKind[] = [
  "write",
  "read",
  "execute",
  "delegate",
  "converse",
  "other",
];

/**
 * 분류 규칙. 화면에 이 문자열을 그대로 노출한다 — 규칙이 보이지 않으면 근거가 아니다.
 * 순서가 곧 우선순위다 (먼저 맞는 것이 이긴다).
 */
export const WORK_RULE: Record<Exclude<WorkKind, "other">, string[]> = {
  write: ["edit", "write", "patch", "insert", "replace", "create", "notebook"],
  read: ["read", "grep", "glob", "search", "fetch", "list", "view", "extract", "lookup", "query"],
  execute: ["bash", "shell", "exec", "run", "test", "build", "install"],
  delegate: ["task", "agent", "delegate", "handoff", "sendmessage", "spawn"],
  converse: ["respond", "answer", "reply", "message", "chat", "completion"],
};

/** 도구 하나의 작업 종류. `call` 은 `Edit(file_path="…")` 같은 모양이다. */
export function workKindOf(turn: Turn): WorkKind {
  const tool = (turn.call ?? "").split("(")[0].toLowerCase();
  if (!tool) {
    // 도구가 없으면 모델이 말한 것이다 — 그것도 토큰을 쓴다.
    return turn.obsType === "llm" || turn.obsType === "chain" ? "converse" : "other";
  }
  for (const kind of Object.keys(WORK_RULE) as Exclude<WorkKind, "other">[]) {
    if (WORK_RULE[kind].some((needle) => tool.includes(needle))) return kind;
  }
  return "other";
}

export interface Bucket {
  key: string;
  tokens: number;
  costUsd: number;
  runs: number;
  observations: number;
  durationMs: number;
}

function empty(key: string): Bucket {
  return { key, tokens: 0, costUsd: 0, runs: 0, observations: 0, durationMs: 0 };
}

function add(into: Map<string, Bucket>, key: string, turn: Turn): void {
  const b = into.get(key) ?? empty(key);
  b.tokens += turn.tokens;
  b.costUsd += turn.costUsd;
  b.observations += 1;
  b.durationMs += turn.durationMs;
  into.set(key, b);
}

/** 런 단위 버킷 (에이전트·소스·모델·프로젝트). 토큰은 런 합계를 쓴다. */
function byRunField(runs: Run[], field: (r: Run) => string): Bucket[] {
  const out = new Map<string, Bucket>();
  for (const run of runs) {
    const key = field(run) || "unknown";
    const b = out.get(key) ?? empty(key);
    b.tokens += run.totalTokens;
    b.costUsd += run.costUsd;
    b.runs += 1;
    b.observations += run.turns.length;
    b.durationMs += run.durationMs;
    out.set(key, b);
  }
  return [...out.values()].sort((a, b) => b.tokens - a.tokens);
}

/** 관측 단위 버킷 (작업 종류·도구·국면). 런 합계가 아니라 턴 토큰을 더한다. */
function byTurnField(runs: Run[], field: (t: Turn, r: Run) => string): Bucket[] {
  const out = new Map<string, Bucket>();
  const seen = new Map<string, Set<string>>();
  for (const run of runs) {
    for (const turn of run.turns) {
      const key = field(turn, run) || "other";
      add(out, key, turn);
      const runs_ = seen.get(key) ?? new Set<string>();
      runs_.add(run.id);
      seen.set(key, runs_);
    }
  }
  for (const [key, b] of out) b.runs = seen.get(key)?.size ?? 0;
  return [...out.values()].sort((a, b) => b.tokens - a.tokens);
}

export interface UsageReport {
  /** 전체 합계 */
  total: Bucket;
  /**
   * 턴 토큰의 합. 런 합계와 다를 수 있다 — 병렬 호출은 한 번만 과금되고, 어댑터가
   * 런 수준 usage 만 받은 경우도 있다. 두 숫자를 같은 것처럼 보여 주면 둘 다 못 믿게
   * 되므로 따로 들고 화면에서 차이를 말한다.
   */
  turnTokens: number;
  bySource: Bucket[];
  byAgent: Bucket[];
  byModel: Bucket[];
  byProject: Bucket[];
  byWorkKind: Bucket[];
  byTool: Bucket[];
  byPhase: Bucket[];
  /** 토큰이 가장 많이 간 작업 종류 */
  dominant: WorkKind | null;
  /** 일별 토큰 — 소스별로 쌓는다 */
  daily: { day: string; bySource: Record<string, number> }[];
  sources: string[];
}

export function buildUsage(runs: Run[], days = 30): UsageReport {
  const total = empty("total");
  for (const run of runs) {
    total.tokens += run.totalTokens;
    total.costUsd += run.costUsd;
    total.runs += 1;
    total.observations += run.turns.length;
    total.durationMs += run.durationMs;
  }

  const byWorkKind = byTurnField(runs, (t) => workKindOf(t));
  const turnTokens = runs.reduce(
    (sum, r) => sum + r.turns.reduce((s, t) => s + t.tokens, 0),
    0,
  );

  // 날짜 축은 데이터에서 만든다. `Date.now()` 를 쓰면 픽스처가 오래될 때 빈 그래프가 된다.
  const stamps = runs.map((r) => Date.parse(r.startedAt)).filter((n) => Number.isFinite(n));
  const newest = stamps.length ? Math.max(...stamps) : Date.now();
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const axis: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    axis.push(dayKey(newest - i * 86_400_000));
  }
  const sources = [...new Set(runs.map((r) => r.source ?? "unknown"))].sort();
  const perDay = new Map<string, Record<string, number>>(
    axis.map((d) => [d, Object.fromEntries(sources.map((s) => [s, 0]))]),
  );
  for (const run of runs) {
    const day = dayKey(Date.parse(run.startedAt));
    const row = perDay.get(day);
    if (!row) continue;
    const src = run.source ?? "unknown";
    row[src] = (row[src] ?? 0) + run.totalTokens;
  }

  return {
    total,
    turnTokens,
    bySource: byRunField(runs, (r) => r.source ?? "unknown"),
    byAgent: byRunField(runs, (r) => r.agent),
    byModel: byRunField(runs, (r) => r.model),
    byProject: byRunField(runs, (r) => r.project),
    byWorkKind,
    byTool: byTurnField(runs, (t) => (t.call ?? "").split("(")[0]).filter((b) => b.key),
    byPhase: byTurnField(runs, (t) => t.phase),
    dominant: (byWorkKind[0]?.key as WorkKind) ?? null,
    daily: axis.map((day) => ({ day, bySource: perDay.get(day) ?? {} })),
    sources,
  };
}
