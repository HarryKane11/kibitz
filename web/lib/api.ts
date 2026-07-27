import "server-only";
import { NextResponse } from "next/server";
import type { Run, Turn } from "@/lib/types";
import { FAILURE_RULE } from "@/lib/types";
import { buildTree } from "@/lib/tree";
import { allowsAnonymousIngest } from "@/lib/deploy";

/**
 * 읽기 API 의 공용부.
 *
 * MCP 서버가 이 API 를 **HTTP 로** 부른다. Python 쪽에 트레이스 리더를 또 만들지
 * 않는 이유는 탐지 규칙을 TypeScript 로 옮기지 않은 이유와 같다 — 같은 계산이 두
 * 곳에 있으면 반드시 갈라지고, 그때 두 답 중 어느 것이 맞는지 아무도 모른다.
 *
 * 부수 효과로 MCP 가 원격 Kibitz 에도 붙는다. 파일을 직접 읽는 구현이면
 * 서버와 같은 디스크에 있어야 했다.
 */

export interface TokenScope {
  project?: string;
  role: "read" | "ingest" | "admin";
}

function scopedTokens(): Record<string, TokenScope> {
  const raw = process.env.KIBITZ_PROJECT_TOKENS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      string | { project?: string; role?: TokenScope["role"] }
    >;
    return Object.fromEntries(
      Object.entries(parsed).map(([token, scope]) => [
        token,
        typeof scope === "string"
          ? { project: scope, role: "admin" as const }
          : { project: scope.project, role: scope.role ?? "read" },
      ]),
    );
  } catch {
    console.warn("[kibitz] KIBITZ_PROJECT_TOKENS is not valid JSON");
    return {};
  }
}

export function tokenScope(req: Request): TokenScope | null {
  const token = bearerOrBasic(req);
  if (!token) return null;
  return scopedTokens()[token] ?? null;
}

/** 읽기 토큰. project-scoped token은 해당 project의 API 결과만 볼 수 있다. */
export function authorizeRead(req: Request): NextResponse | null {
  const scoped = tokenScope(req);
  if (scoped && ["read", "admin"].includes(scoped.role)) return null;
  const expected = process.env.KIBITZ_READ_TOKEN;
  if (!expected && Object.keys(scopedTokens()).length === 0) return null;
  if (bearerOrBasic(req) === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Basic 인증도 받는다.
 *
 * Langfuse 로 계측한 코드는 OTLP exporter 헤더에 `Authorization: Basic <base64>` 를
 * 넣는다. host 만 Kibitz 로 바꿔서 들어올 수 있어야 하므로, 그 형식의 비밀번호
 * 부분(또는 사용자명 부분)이 우리 토큰과 같으면 통과시킨다.
 */
function bearerOrBasic(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const basic = header.match(/^Basic\s+(.+)$/i);
  if (!basic) return null;
  try {
    const decoded = Buffer.from(basic[1].trim(), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return decoded;
    // Langfuse 는 public:secret 을 쓴다. 어느 쪽이 우리 토큰일지 모르므로 둘 다 본다.
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    const expected = process.env.KIBITZ_INGEST_TOKEN;
    return expected && user === expected ? user : pass;
  } catch {
    return null;
  }
}

export function authorizeIngest(req: Request): NextResponse | null {
  const scoped = tokenScope(req);
  if (scoped && ["ingest", "admin"].includes(scoped.role)) return null;
  const expected = process.env.KIBITZ_INGEST_TOKEN;
  // 설치본은 대개 localhost 라 토큰이 없으면 열어 둔다. 공개 배포는 누구나 POST 할
  // 수 있으므로 그 기본값을 그대로 쓰면 아무나 우리 데모에 트레이스를 밀어 넣는다.
  if (!expected && Object.keys(scopedTokens()).length === 0) {
    if (allowsAnonymousIngest()) return null;
    return NextResponse.json(
      { error: "ingest is closed on this deployment" },
      { status: 401 },
    );
  }
  if (bearerOrBasic(req) === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function projectScope(req: Request): string | undefined {
  return tokenScope(req)?.project;
}

export function intParam(v: string | null, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

/**
 * 트레이스 요약.
 *
 * 관측 본문(프롬프트·출력)은 넣지 않는다. 목록을 부르는 쪽은 대개 "어느 것을 볼까"를
 * 정하는 중이고, 전문을 실어 보내면 프롬프트가 의도치 않게 흘러 나간다.
 */
export function runSummary(run: Run) {
  const roots = buildTree(run.turns);
  return {
    id: run.id,
    source: run.source ?? "unknown",
    agent: run.agent,
    project: run.project,
    title: run.title + (run.titleTail ?? ""),
    model: run.model,
    startedAt: run.startedAt,
    status: run.status,
    accuracy: run.score.accuracy,
    errors: run.score.errors,
    wastes: run.score.wastes,
    observations: run.turns.length,
    requestGroups: roots.length,
    /** 에이전트가 실제로 일한 시간. 사람을 기다린 시간은 idleMs 에 따로 있다. */
    durationMs: run.durationMs,
    idleMs: run.idleMs ?? 0,
    totalTokens: run.totalTokens,
    costUsd: run.costUsd,
    sessionId: run.sessionId,
    userId: run.userId,
    tags: run.tags ?? [],
  };
}

/** 판정 하나 + 근거. 규칙 수식을 함께 보낸다 — 받는 쪽이 검증할 수 있어야 한다. */
export function verdictOf(run: Run, turn: Turn) {
  const note = turn.note!;
  return {
    runId: run.id,
    source: run.source ?? "unknown",
    agent: run.agent,
    observation: turn.index,
    kind: note.kind,
    verdict: turn.verdict,
    rule: FAILURE_RULE[note.kind],
    call: turn.call ?? null,
    evidence: note.evidence.map((e) => ({
      label: e.label,
      value: e.valueKey ?? e.value,
      compare: e.compare ?? null,
      compareTurn: e.compareTurn ?? null,
      relation: e.relation ?? null,
    })),
    wouldSave: {
      turns: note.counterfactual.savedTurns,
      ms: note.counterfactual.savedMs,
      tokens: note.counterfactual.savedTokens,
    },
  };
}

/** 관측 하나. 트리 위치와 계측값. */
export function observationOf(turn: Turn) {
  return {
    index: turn.index,
    parent: turn.parentIndex ?? null,
    type: turn.obsType,
    phase: turn.phase,
    verdict: turn.verdict,
    title: turn.title || turn.titleKey || "",
    call: turn.call ?? null,
    callHash: turn.callHash ?? null,
    durationMs: turn.durationMs,
    startOffsetMs: turn.startOffsetMs,
    tokens: turn.tokens,
    costUsd: turn.costUsd,
    recordsKnown: turn.recordsKnown,
    verdictKind: turn.note?.kind ?? null,
  };
}
