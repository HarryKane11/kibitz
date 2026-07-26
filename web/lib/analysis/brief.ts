import type { Run, Turn } from "@/lib/types";
import { FAILURE_RULE } from "@/lib/types";

/**
 * 브리프 — BYOK 분석이 제공자에게 보내는 **전부**.
 *
 * 트랜스크립트를 보내지 않는다. 보내는 것은 이미 결정론적으로 계산된 판정과
 * 그 근거값이다. 이유가 셋이다:
 *
 *   1. 프롬프트·출력 본문이 제3자에게 나가지 않는다. 그게 가장 민감한 데이터다.
 *   2. 싸다. 160턴 런의 트랜스크립트는 수십만 토큰이고, 판정 요약은 2천 토큰이다.
 *   3. 모델이 **판정을 다시 하지 않는다.** 무엇이 문제인지는 이미 정해져 있고,
 *      모델에게 묻는 것은 "그래서 무엇을 바꿔야 하나" 하나뿐이다.
 *
 * 이 모듈이 만든 문자열은 화면에 그대로 보여준다 — 보내기 전에 무엇이 나가는지
 * 사용자가 읽을 수 있어야, 키를 넣는 결정이 정보에 근거한 결정이 된다.
 */

export interface BriefVerdict {
  observation: number;
  kind: string;
  rule: string;
  verdict: string;
  call: string | null;
  evidence: string[];
  savedTurns: number;
  savedMs: number;
  savedTokens: number;
}

export interface Brief {
  runId: string;
  source: string;
  agent: string;
  model: string;
  status: string;
  observations: number;
  durationMs: number;
  idleMs: number;
  totalTokens: number;
  costUsd: number;
  accuracy: number;
  errors: number;
  wastes: number;
  wastedTokenPct: number;
  phases: { phase: string; accuracy: number }[];
  tools: { registered: number; used: number; unusedTokens: number };
  verdicts: BriefVerdict[];
  /** 가장 자주 나온 호출. 판정이 붙지 않은 반복도 여기서는 보인다. */
  hotCalls: { call: string; count: number; tokens: number }[];
  wouldSave: { turns: number; ms: number; tokens: number };
  /** 도구 인자를 지웠는가 (경로·질의가 밖으로 나가지 않는다) */
  redacted: boolean;
}

/** `Bash(command="git status")` → `Bash` */
function toolOf(call: string): string {
  const i = call.indexOf("(");
  return i > 0 ? call.slice(0, i) : call;
}

function evidenceLines(turn: Turn): string[] {
  return (turn.note?.evidence ?? []).map((e) => {
    const value = e.valueKey ?? e.value;
    if (!e.compare) return `${e.label} = ${value}`;
    const where = e.compareTurn !== undefined ? `observation ${e.compareTurn}: ` : "";
    const rel = e.relation ? ` (${e.relation})` : "";
    return `${e.label} = ${value} vs ${where}${e.compare}${rel}`;
  });
}

export function buildBrief(run: Run, { redactArgs = false } = {}): Brief {
  const show = (call: string | undefined) =>
    call ? (redactArgs ? toolOf(call) : call) : null;

  /**
   * 빈도는 `callHash` 로 센다 — 표시용 호출 문자열이 아니라.
   *
   * 표시 문자열은 잘려 있다(`Edit(file_path="/Users/…/elegant-hypat…")`). 그걸 키로
   * 쓰면 서로 다른 파일 29건이 한 항목으로 뭉쳐 "같은 호출 29회"라는 거짓이 된다.
   * `callHash` 는 hash(도구, 인자) 그 자체이므로 같은 것만 같게 센다.
   */
  const counts = new Map<string, { label: string; count: number; tokens: number }>();
  for (const t of run.turns) {
    if (!t.call) continue;
    const label = redactArgs ? toolOf(t.call) : t.call;
    const key = redactArgs ? label : (t.callHash ?? t.call);
    const prev = counts.get(key) ?? { label, count: 0, tokens: 0 };
    counts.set(key, { label, count: prev.count + 1, tokens: prev.tokens + t.tokens });
  }

  const flagged = run.turns.filter((t) => t.note);

  return {
    runId: run.id,
    source: run.source ?? "unknown",
    agent: run.agent,
    model: run.model,
    status: run.status,
    observations: run.turns.length,
    durationMs: run.durationMs,
    idleMs: run.idleMs ?? 0,
    totalTokens: run.totalTokens,
    costUsd: run.costUsd,
    accuracy: run.score.accuracy,
    errors: run.score.errors,
    wastes: run.score.wastes,
    wastedTokenPct: run.score.wastedTokenPct,
    phases: run.score.phases.map((p) => ({ phase: p.phase, accuracy: p.accuracy })),
    tools: {
      registered: run.registeredTools,
      used: run.usedTools,
      unusedTokens: run.unusedToolTokens,
    },
    verdicts: flagged.map((t) => ({
      observation: t.index,
      kind: t.note!.kind,
      rule: FAILURE_RULE[t.note!.kind],
      verdict: t.verdict,
      call: show(t.call),
      evidence: evidenceLines(t),
      savedTurns: t.note!.counterfactual.savedTurns,
      savedMs: t.note!.counterfactual.savedMs,
      savedTokens: t.note!.counterfactual.savedTokens,
    })),
    hotCalls: [...counts.values()]
      .map((v) => ({ call: v.label, count: v.count, tokens: v.tokens }))
      .filter((c) => c.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    wouldSave: flagged.reduce(
      (acc, t) => ({
        turns: acc.turns + t.note!.counterfactual.savedTurns,
        ms: acc.ms + t.note!.counterfactual.savedMs,
        tokens: acc.tokens + t.note!.counterfactual.savedTokens,
      }),
      { turns: 0, ms: 0, tokens: 0 },
    ),
    redacted: redactArgs,
  };
}

/**
 * 브리프를 텍스트로. 이 문자열이 user 메시지 본문이고, 화면에 보여주는 것과 동일하다.
 *
 * JSON 대신 평문인 이유: 사용자가 읽어야 하는 문서이기도 하다. JSON 을 보여주면
 * "무엇이 나가는지 확인하라"는 요구가 형식적인 것이 된다.
 */
export function briefText(b: Brief): string {
  const L: string[] = [];
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  L.push(`# Trace ${b.runId}`);
  L.push(
    `source=${b.source} agent=${b.agent} model=${b.model} status=${b.status}`,
    `observations=${b.observations} duration=${s(b.durationMs)} idle=${s(b.idleMs)} ` +
      `tokens=${b.totalTokens} cost=$${b.costUsd.toFixed(3)}`,
    `accuracy=${b.accuracy}% errors=${b.errors} wastes=${b.wastes} ` +
      `wasted_tokens=${b.wastedTokenPct}%`,
    `phase_accuracy: ${b.phases.map((p) => `${p.phase}=${p.accuracy}%`).join(" ")}`,
    `tools: registered=${b.tools.registered} used=${b.tools.used} ` +
      `unused_definition_tokens=${b.tools.unusedTokens}`,
  );

  L.push("", `# Verdicts (${b.verdicts.length}) — computed, not judged by a model`);
  if (b.verdicts.length === 0) {
    L.push("none");
  }
  for (const v of b.verdicts) {
    L.push(
      "",
      `## observation ${v.observation} · ${v.kind} · ${v.verdict}`,
      `rule: ${v.rule}`,
      v.call ? `call: ${v.call}` : "call: (none)",
      `evidence:`,
      ...v.evidence.map((e) => `  - ${e}`),
      `would_save: turns=${v.savedTurns} ms=${v.savedMs} tokens=${v.savedTokens}`,
    );
  }

  if (b.hotCalls.length > 0) {
    L.push("", "# Repeated calls (frequency ≥ 2, no verdict implied)");
    for (const c of b.hotCalls) L.push(`  ${c.count}× ${c.call} (${c.tokens} tokens)`);
  }

  L.push(
    "",
    `# Total avoidable by the rules above`,
    `turns=${b.wouldSave.turns} ms=${b.wouldSave.ms} tokens=${b.wouldSave.tokens}`,
  );

  if (b.redacted) {
    L.push("", "NOTE: tool arguments were removed before sending; only tool names remain.");
  }

  return L.join("\n");
}
