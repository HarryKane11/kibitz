import type { FailureCluster, FailureKind, Run } from "@/lib/types";
import { FAILURE_RULE } from "@/lib/types";
import type { SkillCandidate } from "@/lib/skills";

/**
 * 판정 → 에이전트 규칙.
 *
 * 관측이 관측으로 끝나면 다음 실행은 똑같이 반복된다. 사람이 대시보드를 보고
 * 고개를 끄덕이는 것으로는 아무것도 바뀌지 않는다 — 바뀌려면 **에이전트가 읽는
 * 자리**에 문장이 들어가야 하고, 코드 에이전트에게 그 자리는 `AGENTS.md` 다
 * (Claude Code 는 `CLAUDE.md`, Codex 는 `AGENTS.md`).
 *
 * **모델을 부르지 않는다.** 규칙 문장은 판정 종류마다 미리 쓰여 있고, 숫자만
 * 실측값으로 채운다. 여기서 모델에게 "무슨 규칙을 쓸까"를 물으면 그 문장은
 * 검증할 수 없고, 검증할 수 없는 문장을 사용자의 `AGENTS.md` 에 넣는 것은
 * 이 제품이 하지 않기로 한 바로 그 일이다.
 *
 * 그래서 규칙마다 **근거 줄이 따라 붙는다** — 몇 개 런에서 몇 토큰을 태웠는지.
 * 사용자가 그 줄을 읽고 "이건 우리 사정상 맞다"고 판단해 지울 수 있어야 한다.
 */

/** 규칙 하나. `body` 가 붙여 넣을 문장이고 `evidence` 가 그 근거다. */
export interface AgentRule {
  kind: FailureKind | "skill";
  /** 규칙 본문 — 명령형 한 문장 */
  body: string;
  /** 이 규칙이 어디서 나왔나 */
  evidence: string;
  /**
   * 이 규칙에 딸린 토큰. **의미가 종류마다 다르다.**
   *
   * 판정 규칙에서는 *낭비된* 토큰이다 — 지켰다면 안 썼을 값.
   * 스킬 규칙에서는 *그 일에 쓴* 토큰이다 — 일 자체는 필요했으므로 전부
   * 아껴지지 않는다. 두 값을 더해 "이만큼 아낀다"고 말하면 안 된다.
   */
  tokens: number;
}

/**
 * 판정 종류별 규칙 문구.
 *
 * 로케일 사전에 두지 않는다 — 이 문장은 화면에 보이는 UI 가 아니라 **에이전트가
 * 읽을 파일의 내용**이고, 코드 에이전트에게는 영어로 주는 편이 안전하다.
 * 사용자가 파일에 넣기 전에 자기 말로 고쳐 쓸 수 있다.
 */
const RULE_TEXT: Record<FailureKind, string> = {
  "repeated-call":
    "Before calling a tool, check whether the previous call had the same arguments. If it did, the result has not changed — reuse it instead of calling again.",
  "call-cycle":
    "If you notice the same two or three calls alternating, stop and state what you are missing. A cycle means the plan is wrong, not that the next call will differ.",
  "empty-result-loop":
    "When a search returns nothing, change the query before retrying. Repeating an identical query against an unchanged source returns nothing again.",
  "context-eviction":
    "Restate the constraints from the original request before a long tool sequence. Instructions given early are the first thing lost when context is trimmed.",
  "cache-break":
    "Keep the stable part of the prompt — system text, tool definitions, file contents already read — in the same order across calls. Reordering it discards the prefix cache and the whole prefix is billed again.",
  "unsourced-number":
    "Every figure in the answer must come from a tool result or the user's own words. If you cannot point at where a number came from, say you do not have it.",
};

/** 얼마나 자주 걸려야 규칙으로 승격하나. 한 번 걸린 것은 사고이지 습관이 아니다. */
const MIN_RUNS = 2;

/**
 * 판정 하나의 근거 줄.
 *
 * `wastedTokens` 와 `wastedUsd` 는 **다른 것을 잰다.** 앞은 반사실("안 했으면
 * 안 썼을 토큰")이고 뒤는 걸린 단계에 실제로 든 비용이다. 대개 같이 움직이지만
 * `unsourced-number` 는 절약 토큰이 0 이다 — 출처 없는 숫자를 쓰는 것은 토큰을
 * 버리는 실패가 아니라 **답을 틀리게 하는** 실패라서 그렇다.
 *
 * 그 경우에 "0 tokens ($0.15)" 라고 적으면 둘 중 하나가 고장 난 것처럼 읽힌다.
 * 0 을 숨기지도, 틀린 척 붙이지도 말고 무엇이 손해인지를 말한다.
 */
function clusterEvidence(c: FailureCluster): string {
  const head = `${c.kind} — ${c.runCount} runs`;
  const cost = `$${c.wastedUsd.toFixed(2)} spent on the affected steps`;
  const body =
    c.wastedTokens > 0
      ? `${c.wastedTokens.toLocaleString()} tokens avoidable, ${cost}`
      : `${cost}; this one costs correctness, not tokens`;
  return `${head}, ${body}. Rule: ${FAILURE_RULE[c.kind]}`;
}

/**
 * 이 프로젝트의 규칙 목록.
 *
 * 걸린 런이 하나뿐인 판정은 뺀다 — 한 번 일어난 일을 영구 규칙으로 만들면
 * `AGENTS.md` 가 지난 사고의 목록이 되고, 그러면 에이전트가 그 파일을 안 읽는다.
 */
export function buildAgentRules(
  clusters: FailureCluster[],
  skills: SkillCandidate[],
): AgentRule[] {
  const rules: AgentRule[] = clusters
    .filter((c) => c.runCount >= MIN_RUNS)
    .map((c) => ({
      kind: c.kind,
      body: RULE_TEXT[c.kind],
      evidence: clusterEvidence(c),
      tokens: c.wastedTokens,
    }));

  // 여러 세션에 걸친 반복은 금지 규칙이 아니라 **도구를 만들라**는 신호다.
  for (const s of skills.filter((x) => x.runIds.length >= MIN_RUNS).slice(0, 3)) {
    rules.push({
      kind: "skill",
      body: `\`${s.signature}\` has been run by hand in ${s.runIds.length} separate sessions. Wrap it in a script or skill and call that instead of rebuilding the steps each time.`,
      evidence: `${s.occurrences} occurrences across ${s.runIds.length} sessions, ${s.tokens.toLocaleString()} tokens. Example: ${s.examples[0] ?? s.signature}`,
      tokens: s.tokens,
    });
  }

  // 판정 규칙을 먼저, 각 무리 안에서는 토큰 큰 것부터. 종류를 섞어 정렬하면
  // 낭비 토큰과 작업 토큰을 같은 자로 재게 된다.
  const rank = (r: AgentRule) => (r.kind === "skill" ? 1 : 0);
  return rules.sort((a, b) => rank(a) - rank(b) || b.tokens - a.tokens);
}

/**
 * 붙여 넣을 수 있는 마크다운.
 *
 * 사용자의 파일에 **덧붙일 조각**이지 파일 전체가 아니다. 우리가 `AGENTS.md` 를
 * 통째로 써 주면 사람이 쓴 규칙을 우리가 덮어쓰게 된다.
 */
export function rulesMarkdown(rules: AgentRule[], project: string): string {
  if (rules.length === 0) return "";
  // 낭비 토큰만 더한다. 스킬 후보의 토큰은 **해야 했던 일**에 쓴 것이라
  // 여기 섞으면 아끼는 양을 부풀리게 된다.
  const wasted = rules
    .filter((r) => r.kind !== "skill")
    .reduce((a, r) => a + r.tokens, 0);
  const skills = rules.filter((r) => r.kind === "skill").length;
  return [
    `## Observed failure patterns — ${project}`,
    "",
    "Derived from Kibitz traces by counting, not by asking a model.",
    `The failure rules below account for ${wasted.toLocaleString()} tokens already spent on work that produced nothing.`,
    ...(skills
      ? [
          `The last ${skills} are not failures — they are work repeated across sessions that a script could do once.`,
        ]
      : []),
    "",
    ...rules.flatMap((r) => [`- ${r.body}`, `  <!-- ${r.evidence} -->`]),
    "",
  ].join("\n");
}

/** 어느 프로젝트의 규칙인가. 런이 없으면 프로젝트 이름도 없다. */
export function projectOf(runs: Run[]): string {
  return runs[0]?.project ?? "this project";
}
