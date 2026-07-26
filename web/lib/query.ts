import type { Run } from "@/lib/types";

/**
 * 속성 기반 필터.
 *
 * LangSmith 의 필터 바와 같은 모양이다: (필드, 연산자, 값) 행을 쌓고 AND/OR 로 묶는다.
 * 드롭다운 몇 개로는 "opus 로 돌았고 실패했고 비용이 $1 넘는 것"을 물어볼 수 없다.
 *
 * URL 에 직렬화된다 — 필터가 걸린 화면을 그대로 링크로 넘길 수 있어야 팀에서 쓸모가 있다.
 * 파싱은 방어적이다: 망가진 쿼리 문자열이 화면을 죽이면 링크 공유가 무섭다.
 */

export const FIELDS = [
  "source",
  "agent",
  "model",
  "status",
  "user",
  "session",
  "tag",
  "release",
  "environment",
  "accuracy",
  "cost",
  "tokens",
  "duration",
  "turns",
  "errors",
  "title",
] as const;
export type Field = (typeof FIELDS)[number];

/** 숫자 필드는 비교 연산자를 쓴다. 나머지는 문자열 연산자. */
export const NUMERIC: ReadonlySet<Field> = new Set([
  "accuracy",
  "cost",
  "tokens",
  "duration",
  "turns",
  "errors",
]);

export const TEXT_OPS = ["is", "is not", "contains", "not contains"] as const;
export const NUM_OPS = ["=", "!=", ">", "<", ">=", "<="] as const;
export type Op = (typeof TEXT_OPS)[number] | (typeof NUM_OPS)[number];

export function opsFor(field: Field): readonly Op[] {
  return NUMERIC.has(field) ? NUM_OPS : TEXT_OPS;
}

export interface Clause {
  field: Field;
  op: Op;
  value: string;
}

export interface Query {
  join: "and" | "or";
  clauses: Clause[];
  /** 전문 검색 */
  q?: string;
}

export const EMPTY_QUERY: Query = { join: "and", clauses: [] };

/* ── 값 추출 ────────────────────────────────────────────────── */

function numberOf(run: Run, field: Field): number {
  switch (field) {
    case "accuracy":
      return run.score.accuracy;
    case "cost":
      return run.costUsd;
    case "tokens":
      return run.totalTokens;
    case "duration":
      return run.durationMs / 1000;
    case "turns":
      return run.turns.length;
    case "errors":
      return run.score.errors;
    default:
      return 0;
  }
}

function stringsOf(run: Run, field: Field): string[] {
  switch (field) {
    case "source":
      return [run.source ?? ""];
    case "agent":
      return [run.agent];
    case "model":
      return [run.model];
    case "status":
      return [run.status];
    case "user":
      return [run.userId ?? ""];
    case "session":
      return [run.sessionId ?? ""];
    case "tag":
      return run.tags ?? [];
    case "release":
      return [run.release ?? ""];
    case "environment":
      return [run.environment ?? ""];
    case "title":
      return [run.title + (run.titleTail ?? "")];
    default:
      return [];
  }
}

function matchClause(run: Run, c: Clause): boolean {
  const raw = c.value.trim();
  if (!raw) return true; // 값이 비면 아직 작성 중이다 — 아무것도 걸러내지 않는다

  if (NUMERIC.has(c.field)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return true;
    const v = numberOf(run, c.field);
    switch (c.op) {
      case "=":
        return v === n;
      case "!=":
        return v !== n;
      case ">":
        return v > n;
      case "<":
        return v < n;
      case ">=":
        return v >= n;
      case "<=":
        return v <= n;
      default:
        return true;
    }
  }

  const needle = raw.toLowerCase();
  const hay = stringsOf(run, c.field).map((x) => x.toLowerCase());
  switch (c.op) {
    case "is":
      return hay.some((x) => x === needle);
    case "is not":
      return !hay.some((x) => x === needle);
    case "contains":
      return hay.some((x) => x.includes(needle));
    case "not contains":
      return !hay.some((x) => x.includes(needle));
    default:
      return true;
  }
}

export function matchRun(run: Run, query: Query): boolean {
  const q = query.q?.trim().toLowerCase();
  if (q) {
    const hay = [
      run.title,
      run.titleTail ?? "",
      run.id,
      run.agent,
      run.userId ?? "",
      run.sessionId ?? "",
    ]
      .join(" ")
      .toLowerCase();
    // 공백으로 쪼개 부분 일치를 모두 요구한다 — 순서는 상관하지 않는다
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }

  const active = query.clauses.filter((c) => c.value.trim());
  if (!active.length) return true;
  return query.join === "and"
    ? active.every((c) => matchClause(run, c))
    : active.some((c) => matchClause(run, c));
}

/* ── 직렬화 ─────────────────────────────────────────────────── */

/** `agent is sales-reporter AND cost > 1` — 사람이 읽고 붙여넣을 수 있는 형태. */
export function toQueryLanguage(query: Query): string {
  const parts = query.clauses
    .filter((c) => c.value.trim())
    .map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value.trim())}`);
  if (query.q?.trim()) parts.unshift(`search ${JSON.stringify(query.q.trim())}`);
  return parts.join(query.join === "and" ? " AND " : " OR ") || "—";
}

/**
 * URL 파라미터로. `f` 에 절 목록, `j` 에 결합자.
 *
 * 구분자를 값에 나타날 수 없는 것으로 골랐다 (`~` / `|`). 값에 그게 들어오면
 * 인코딩되므로 안전하다.
 */
export function toParams(query: Query): URLSearchParams {
  const p = new URLSearchParams();
  const active = query.clauses.filter((c) => c.value.trim());
  if (active.length) {
    p.set("f", active.map((c) => `${c.field}~${c.op}~${c.value.trim()}`).join("|"));
    if (query.join === "or") p.set("j", "or");
  }
  if (query.q?.trim()) p.set("q", query.q.trim());
  return p;
}

const isField = (v: string): v is Field => (FIELDS as readonly string[]).includes(v);

export function fromParams(get: (k: string) => string | undefined): Query {
  const raw = get("f") ?? "";
  const clauses: Clause[] = [];
  for (const chunk of raw.split("|")) {
    if (!chunk) continue;
    const [field, op, ...rest] = chunk.split("~");
    if (!isField(field)) continue;
    const value = rest.join("~");
    const allowed = opsFor(field) as readonly string[];
    if (!allowed.includes(op)) continue;
    clauses.push({ field, op: op as Op, value });
  }
  return { join: get("j") === "or" ? "or" : "and", clauses, q: get("q") };
}

/* ── 필터 숏컷 ──────────────────────────────────────────────── */

export interface Shortcut {
  field: Field;
  value: string;
  count: number;
}

/**
 * 이 데이터에 실제로 있는 값 중 흔한 것들.
 *
 * 손으로 적은 목록은 데이터가 바뀌면 거짓이 된다. 여기서 세면 항상 참이고,
 * 사용자는 존재하지 않는 값을 고를 수 없다.
 */
export function shortcuts(runs: Run[], fields: Field[] = ["source", "status", "model", "agent"]): Shortcut[] {
  const out: Shortcut[] = [];
  for (const field of fields) {
    const counts = new Map<string, number>();
    for (const run of runs) {
      for (const v of stringsOf(run, field)) {
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([value, count]) => out.push({ field, value, count }));
  }
  return out;
}
