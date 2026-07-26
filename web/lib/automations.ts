import type { Run } from "@/lib/types";
import { matchRun, type Query } from "@/lib/query";

/**
 * 자동화 규칙.
 *
 * LangSmith 의 rule 과 같은 모양이다: 필터 → 샘플링 비율 → 액션. 액션 순서는
 * 고정이다 (어노테이션 큐 → 데이터셋 → 웹훅 → 평가자).
 *
 * **아무것도 쓰지 않는다.** 쓸 백엔드가 없으므로, 규칙이 지금 무엇을 잡을지 실제 런에
 * 대해 계산해 보여주고 거기서 멈춘다. 저장되는 척하는 UI 보다 "이만큼 잡힌다"가 낫다.
 */

export const ACTION_ORDER = ["queue", "dataset", "webhook", "evaluator", "retention"] as const;
export type Action = (typeof ACTION_ORDER)[number];

export interface Rule {
  id: string;
  name: string;
  query: Query;
  /** 0–1. 일치한 것 중 실제로 처리할 비율. */
  sampling: number;
  actions: Action[];
  enabled: boolean;
}

/**
 * 기본 규칙 세 개.
 *
 * 손으로 지어낸 시나리오가 아니라 **이 데이터에 실제로 걸리는** 조건들이다.
 * 하나도 잡지 못하는 규칙을 예시로 두면 기능이 동작하는지 알 수 없다.
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: "rl_failed",
    name: "Failed runs → annotation queue",
    query: { join: "and", clauses: [{ field: "status", op: "is", value: "failed" }] },
    sampling: 1,
    actions: ["queue"],
    enabled: true,
  },
  {
    id: "rl_expensive",
    name: "Expensive runs → dataset",
    query: { join: "and", clauses: [{ field: "cost", op: ">", value: "2" }] },
    sampling: 0.5,
    actions: ["dataset", "webhook"],
    enabled: true,
  },
  {
    id: "rl_lowacc",
    name: "Accuracy below 95 → evaluator",
    query: { join: "and", clauses: [{ field: "accuracy", op: "<", value: "95" }] },
    sampling: 1,
    actions: ["evaluator"],
    enabled: false,
  },
];

/** 결정론적 샘플링. 런 id 로 뽑으므로 새로고침해도 같은 집합이 나온다. */
function sampled(runId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let h = 2166136261;
  for (let i = 0; i < runId.length; i++) {
    h ^= runId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 < rate;
}

export interface RuleHit {
  run: Run;
  /** 필터에는 걸렸지만 샘플링에서 빠졌는가 */
  skipped: boolean;
}

export function evaluateRule(rule: Rule, runs: Run[]): RuleHit[] {
  return runs
    .filter((r) => matchRun(r, rule.query))
    .map((run) => ({ run, skipped: !sampled(run.id, rule.sampling) }));
}
