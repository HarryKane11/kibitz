import "server-only";
import capturedRuns from "@/lib/mock/traces.json";
import { loadStoredRun, loadStoredRuns, storedFileCount } from "@/lib/store";
import { indexedCount, summaries, syncFromFiles, type RunRow } from "@/lib/index-db";
import { matchRun, shortcuts, type Query } from "@/lib/query";
import { salesRun } from "@/lib/mock/sales-run";
import {
  PHASES,
  type Evidence,
  type FailureCluster,
  type FailureKind,
  type Overview,
  type PhaseScore,
  type Run,
  type RunScore,
  type RunStatus,
  type Turn,
  type Verdict,
} from "@/lib/types";

/**
 * 데이터 접근 계층.
 *
 * 화면은 이 모듈만 본다. 실제 백엔드(OTel 수집 → ClickHouse)가 붙으면
 * 아래 공개 함수 본문만 fetch 로 교체하면 되고 컴포넌트는 손대지 않는다.
 */

/** 결정론적 PRNG. 서버·클라이언트 렌더가 갈리면 하이드레이션이 깨진다. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [
  { id: "run_7c1e04", agent: "sales-reporter", title: "Built the monthly pipeline report", tail: " and pushed it to the dashboard", model: "claude-opus-5", minutesAgo: 41, seed: 12, n: 11, errors: 0, wastes: 1, humans: 0, status: "ok" },
  { id: "run_9b77d2", agent: "contract-reviewer", title: "Reviewed 3 NDAs for onerous clauses", tail: " and left comments", model: "claude-opus-5", minutesAgo: 96, seed: 27, n: 18, errors: 1, wastes: 3, humans: 1, status: "degraded" },
  { id: "run_4d2a19", agent: "support-triage", title: "Started triaging 62 unlabelled tickets", tail: " and stopped halfway", model: "claude-sonnet-5", minutesAgo: 133, seed: 41, n: 24, errors: 3, wastes: 4, humans: 2, status: "failed" },
  { id: "run_2f9c88", agent: "support-triage", title: "Assigned 8 urgent tickets", tail: " to their owners", model: "claude-sonnet-5", minutesAgo: 187, seed: 55, n: 9, errors: 0, wastes: 0, humans: 0, status: "ok" },
  { id: "run_6a30f5", agent: "contract-reviewer", title: "Collected 12 contracts up for renewal", tail: " and handed them to legal", model: "claude-opus-5", minutesAgo: 242, seed: 63, n: 15, errors: 1, wastes: 2, humans: 0, status: "degraded" },
  { id: "run_1e5b73", agent: "sales-reporter", title: "Compared revenue by region", tail: " and flagged the outliers", model: "claude-opus-5", minutesAgo: 310, seed: 78, n: 13, errors: 0, wastes: 2, humans: 0, status: "ok" },
  { id: "run_5c8d40", agent: "onboarding-bot", title: "Tried to create accounts for new hires", tail: " and failed on a permission error", model: "claude-haiku-4-5", minutesAgo: 388, seed: 91, n: 20, errors: 4, wastes: 3, humans: 1, status: "failed" },
  { id: "run_3a6f2c", agent: "onboarding-bot", title: "Sent the onboarding checklist", tail: " and collected the replies", model: "claude-haiku-4-5", minutesAgo: 455, seed: 104, n: 10, errors: 0, wastes: 1, humans: 0, status: "ok" },
] as const;

const TOOLS = ["search", "get_record", "list_schema", "compute", "draft", "validate", "notify"];

/**
 * 턴 제목은 에이전트 자신의 문장을 흉내낸 것이다.
 * 실제 런에서도 모델의 말은 번역하지 않으므로 여기서도 원문 그대로 둔다.
 */
const TITLES: Record<Verdict, string[]> = {
  good: [
    "Get the material I need first",
    "Filter down to the rows that match",
    "Verify the result before moving on",
    "Recompute the totals and reconcile",
    "Hand the summary over",
  ],
  waste: [
    "Query a wide range without checking first",
    "Fetch a value I already have",
    "Re-read the whole thing unnecessarily",
  ],
  error: [
    "Repeat the same lookup",
    "Continue without the earlier instruction",
    "Write down a figure with no source",
  ],
  human: ['A person stepped in — "that’s not it"'],
};

/** 규칙이 실제로 대조하는 관측치의 모양. 문구는 사전에 있다. */
const RULE_EVIDENCE: Record<FailureKind, (hash: string, prevHash: string) => Evidence[]> = {
  "repeated-call": (h, prev) => [
    { label: "argHash", value: h, compare: prev, relation: "same" },
    { label: "newRecords", value: "0" },
  ],
  "call-cycle": (h) => [
    { label: "repeatedSubsequence", value: "A → B → A → B" },
    { label: "argHash", value: h },
  ],
  "empty-result-loop": (h) => [
    { label: "resultCount", value: "0" },
    { label: "nextArgHash", value: h, compare: h, relation: "same" },
  ],
  "context-eviction": () => [
    { label: "missingMessage", value: "msg_u0", relation: "missing" },
    { label: "historyTokens", value: "", valueKey: "decreased" },
  ],
  "cache-break": () => [
    { label: "cacheRead", value: "68,400 → 0", relation: "missing" },
    { label: "repaidTokens", value: "68,400" },
  ],
  "unsourced-number": () => [
    { label: "unsourced", value: "1", relation: "absent" },
    { label: "relatedLookups", value: "", valueKey: "zeroCalls" },
  ],
};

const ERROR_KINDS: FailureKind[] = ["repeated-call", "context-eviction", "unsourced-number"];
const WASTE_KINDS: FailureKind[] = ["empty-result-loop", "call-cycle"];

function buildTurns(s: (typeof SEEDS)[number]): Turn[] {
  const r = rng(s.seed);
  const slots: Verdict[] = Array.from({ length: s.n }, () => "good");
  const taken = new Set<number>();
  const place = (v: Verdict, count: number) => {
    let guard = 0;
    for (let k = 0; k < count && guard < 300; guard++) {
      const i = 2 + Math.floor(r() * (s.n - 4));
      if (taken.has(i)) continue;
      taken.add(i);
      slots[i] = v;
      k++;
    }
  };
  place("error", s.errors);
  place("waste", s.wastes);
  place("human", s.humans);

  let known = 0;
  let prevHash = "000000";
  let elapsed = 0;

  return slots.map((v, i) => {
    const phase = PHASES[Math.min(3, Math.floor((i / s.n) * 4))];
    const gained = v === "good" && i > 0 ? 1 + Math.floor(r() * 2) : 0;
    known += gained;

    const durationMs = v === "human" ? 6000 + Math.floor(r() * 9000) : 900 + Math.floor(r() * 3600);
    const tokens = v === "human" ? 52 : 500 + Math.floor(r() * 5200);
    const kind =
      v === "error"
        ? ERROR_KINDS[Math.floor(r() * ERROR_KINDS.length)]
        : WASTE_KINDS[Math.floor(r() * WASTE_KINDS.length)];

    // 반복 호출이면 해시를 직전과 같게 둔다 — 근거와 데이터가 일치해야 한다
    const hash =
      kind === "repeated-call" && (v === "error" || v === "waste")
        ? prevHash
        : Math.floor(r() * 0xffffff).toString(16).padStart(6, "0");
    const shown = prevHash;
    prevHash = hash;

    const hist = 240 + i * 190;
    const rag = Math.min(13800, i * 900);

    const startOffsetMs = elapsed;
    elapsed += i === 0 ? 0 : durationMs;

    return {
      index: i,
      phase,
      kind: i === 0 ? "user" : v === "human" ? "human" : "decision",
      // 턴 0 이 요청이고 나머지는 그 아래 달린다 — 실측 런과 같은 모양.
      obsType: (i === 0
        ? "chain"
        : v === "human"
          ? "event"
          : i === s.n - 1
            ? "llm"
            : i % 3 === 1
              ? "retriever"
              : "tool") as Turn["obsType"],
      parentIndex: i === 0 ? undefined : 0,
      startOffsetMs,
      verdict: v,
      title: i === 0 ? "" : TITLES[v][Math.floor(r() * TITLES[v].length)],
      titleKey: i === 0 ? "userRequest" : undefined,
      utterance: i === 0 ? s.title + s.tail : undefined,
      call: i === 0 ? undefined : `${TOOLS[Math.floor(r() * TOOLS.length)]}(…)`,
      callHash: i === 0 ? undefined : hash,
      resultKey: v === "human" ? undefined : "records",
      resultCount: v === "good" ? gained : 0,
      durationMs: i === 0 ? 0 : durationMs,
      tokens: i === 0 ? 40 : tokens,
      costUsd: i === 0 ? 0 : Number((tokens * 0.0000045).toFixed(4)),
      recordsKnown: known,
      context: [
        { label: "system", tokens: 420 },
        { label: "skills", tokens: 780 },
        { label: "tools", tokens: 3300 },
        {
          label: "history",
          tokens:
            v === "error" && kind === "context-eviction" ? Math.round(hist * 0.5) : hist,
        },
        { label: "retrieval", tokens: rag },
      ],
      prompt: i === 0 ? undefined : "…",
      output: v === "good" ? `{ "total": ${gained} }` : '{ "results": [], "total": 0 }',
      note:
        v === "error" || v === "waste"
          ? {
              kind,
              evidence: RULE_EVIDENCE[kind](hash, shown),
              counterfactual: {
                savedTurns: kind === "unsourced-number" ? 0 : 1,
                savedMs: kind === "unsourced-number" ? 0 : durationMs,
                savedTokens: kind === "unsourced-number" ? 0 : tokens,
              },
            }
          : undefined,
    } satisfies Turn;
  });
}

/**
 * 점수는 항상 턴에서 파생시킨다.
 * 하드코딩하면 화면에 보이는 것과 스코어카드가 어긋난다 — 실제로 어긋났었다.
 */
/**
 * 정확도의 분모는 **에이전트가 내린 결정**이다.
 *
 * 사용자 요청(chain 루트)은 에이전트의 판단이 아니므로 세지 않는다. 세면 요청이
 * 많은 런일수록 정확도가 공짜로 올라간다 — 실제로 그렇게 부풀어 있었다.
 */
const isDecision = (t: Turn) => t.obsType !== "chain";

/**
 * 런의 점수. 전부 세기이고, 모델에게 묻지 않는다.
 *
 * 스코어 **화면**은 없앴지만 이 계산은 남는다 — 화면과 계산은 다른 것이다.
 * 트레이스 목록의 정확도 열, 대시보드 요약, 분석 브리프가 이 값을 쓴다.
 *
 * **`agent/kibitz_ingest/build.py` 와 같은 식이어야 한다.** 픽스처와 실제로
 * 인제스트된 런이 다른 식으로 채점되면 두 숫자를 나란히 놓는 순간 둘 다
 * 못 믿게 된다. 저쪽을 고치면 여기도 고친다.
 */
function computeScore(turns: Turn[]): RunScore {
  const decisions = turns.filter(isDecision);
  const denom = decisions.length || 1;
  const totalTokens = turns.reduce((a, t) => a + t.tokens, 0);
  const wastedTokens = turns
    .filter((t) => t.verdict === "waste" || t.verdict === "error")
    .reduce((a, t) => a + t.tokens, 0);

  const phases: PhaseScore[] = (["plan", "gather", "reason", "deliver"] as const).map(
    (phase) => {
      const sub = turns.filter((t) => t.phase === phase);
      const ok = sub.filter((t) => t.verdict === "good").length;
      return {
        phase,
        accuracy: sub.length ? Math.round((ok / sub.length) * 100) : 100,
      };
    },
  );

  return {
    accuracy: Math.round(
      (decisions.filter((t) => t.verdict === "good").length / denom) * 100,
    ),
    errors: turns.filter((t) => t.verdict === "error").length,
    wastes: turns.filter((t) => t.verdict === "waste").length,
    wastedTokenPct: totalTokens ? Math.round((wastedTokens / totalTokens) * 100) : 0,
    phases,
  };
}

/** 반사실을 런 단위로 합산한다. 요약 화면의 결론이 되는 숫자다. */
export function sumCounterfactuals(turns: Turn[]) {
  const flagged = turns.filter((t) => t.note);
  return {
    count: flagged.length,
    turns: flagged.reduce((a, t) => a + t.note!.counterfactual.savedTurns, 0),
    ms: flagged.reduce((a, t) => a + t.note!.counterfactual.savedMs, 0),
    tokens: flagged.reduce((a, t) => a + t.note!.counterfactual.savedTokens, 0),
  };
}


function buildRun(s: (typeof SEEDS)[number]): Run {
  const turns = buildTurns(s);
  return {
    id: s.id,
    project: "acme-platform",
    agent: s.agent,
    title: s.title,
    titleTail: s.tail,
    model: s.model,
    startedAt: new Date(
      Date.parse("2026-07-26T09:14:02+09:00") - s.minutesAgo * 60_000,
    ).toISOString(),
    durationMs: turns.reduce((a, t) => a + t.durationMs, 0),
    totalTokens: turns.reduce((a, t) => a + t.tokens, 0),
    costUsd: Number(turns.reduce((a, t) => a + t.costUsd, 0).toFixed(3)),
    humanInterventions: s.humans,
    status: s.status,
    registeredTools: 41,
    usedTools: 3 + (s.seed % 5),
    unusedToolTokens: 2890,
    score: computeScore(turns),
    turns,
  };
}

/**
 * 실측 런 — 코드 에이전트 세션 기록에서 변환된 것.
 *
 * `agent/kibitz_ingest` 가 Claude Code(~/.claude/projects)와
 * Codex(~/.codex/sessions)를 읽어 만든다. 어댑터가 형식을 흡수하고
 * 탐지는 하나의 코드를 지나므로 두 에이전트의 숫자를 나란히 비교할 수 있다.
 * LLM 판정 없이 tool_use 인자 해시·usage·timestamp 만으로 탐지한 결과다.
 * 목 데이터와 섞어 두는 이유는 화면이 두 종류를 모두 견디는지 보기 위해서다.
 */
const realRuns = capturedRuns as unknown as Run[];

const USERS = ["u_alice", "u_ben", "u_evan", "u_chen", "u_dara"];
const TAG_POOL = ["production", "staging", "coding", "research", "long-horizon", "regression"];

/**
 * 세션·사용자·태그를 붙인다.
 *
 * 실제 계측이라면 SDK 가 실어 보내는 값이다. 여기서는 런 id 에서 결정론적으로
 * 파생시켜 화면이 이 축들을 실제로 견디는지 본다 — 하이드레이션이 갈리면 안 되므로
 * 난수를 쓰지 않는다.
 */
function enrichDemo(run: Run, i: number): Run {
  const h = [...run.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const tags = TAG_POOL.filter((_, k) => (h >> k) % 3 === 0).slice(0, 3);
  return {
    ...run,
    sessionId: `sess_${run.agent}_${(h % 4) + 1}`,
    userId: USERS[h % USERS.length],
    tags: tags.length ? tags : ["production"],
    release: `v4.${(h % 3) + 1}.0`,
    environment: i % 5 === 0 ? "staging" : "production",
  };
}

/**
 * 세 출처를 합친다.
 *
 *  1. 번들된 트레이스 — 인제스터가 빌드 전에 만든 것 (`lib/mock/traces.json`)
 *  2. 저장소 — SDK 가 실행 중에 보낸 것 (`.kibitz/traces/`)
 *  3. 합성 픽스처 — 화면이 두 종류를 모두 견디는지 보기 위한 것
 *
 * 점수는 전부 `computeScore(turns)` 로 **다시 계산한다.** 보내온 쪽이 계산해 둔
 * 점수를 믿으면 SDK 버전에 따라 화면의 숫자가 달라진다.
 */
const DEMO_RUNS = [{ ...salesRun, score: computeScore(salesRun.turns) }, ...SEEDS.map(buildRun)].map(
  enrichDemo,
);

/**
 * 현재 트레이스 목록.
 *
 * 런타임 저장소는 요청마다 다시 읽는다. POST 직후 새 트레이스가 보이지 않던 모듈
 * 캐시 문제를 피하고, SDK가 보낸 session/user/tag 메타데이터를 그대로 보존한다.
 * 실데이터가 하나라도 있으면 합성 데모는 섞지 않는다.
 */
/* ══════════════════════════════════════════════════════════════
   인덱스 경유 읽기 — 목록·집계는 파일을 열지 않는다
   ──────────────────────────────────────────────────────────────
   `allRuns()` 는 저장된 트레이스를 전부 파싱한다. 그게 페이지 렌더마다 일어나므로
   런이 늘면 모든 화면이 같이 느려진다 (측정값은 lib/index-db.ts 주석에).

   목록과 집계는 관측 본문이 필요 없다. 요약 열만 SQLite 에서 읽으면 개수와
   무관하게 일정하다. 상세 화면은 파일 **하나**만 읽는다.
   ══════════════════════════════════════════════════════════════ */

/** 인덱스가 파일과 어긋나 있으면 맞춘다. 개수만 비교하므로 싸다. */
function ensureIndex(): void {
  try {
    const files = storedFileCount();
    if (files !== indexedCount()) syncFromFiles(loadStoredRun);
  } catch {
    // 인덱스는 파생이다. 못 맞추면 파일 경로로 계속 간다.
  }
}

/** 저장된 트레이스 요약. 목록·필터·대시보드가 쓴다. */
export async function storedSummaries(query: Parameters<typeof summaries>[0] = {}): Promise<RunRow[]> {
  ensureIndex();
  return summaries(query);
}



export function allRuns(): Run[] {
  const byId = new Map<string, Run>();
  for (const run of [...realRuns, ...loadStoredRuns()]) {
    byId.set(run.id, { ...run, score: computeScore(run.turns) });
  }
  return byId.size > 0 ? [...byId.values()] : DEMO_RUNS;
}

/**
 * 실패 유형 묶음은 **런에서 집계한다**.
 *
 * 예전엔 손으로 쓴 숫자였다. 그러면 화면의 다른 곳과 어긋나고, 어긋난 순간
 * 이 제품이 파는 것(= 숫자를 믿을 수 있다)이 무너진다.
 */
function buildClusters(runs: Run[]): FailureCluster[] {
  const acc = new Map<FailureKind, FailureCluster>();
  const now = Date.parse("2026-07-26T09:14:02+09:00");

  for (const run of runs) {
    const day = Math.min(
      6,
      Math.max(0, 6 - Math.floor((now - Date.parse(run.startedAt)) / 86_400_000)),
    );
    const seen = new Set<FailureKind>();

    for (const turn of run.turns) {
      if (!turn.note) continue;
      const k = turn.note.kind;
      const c =
        acc.get(k) ??
        ({ kind: k, runCount: 0, wastedTokens: 0, wastedUsd: 0, trend: [0, 0, 0, 0, 0, 0, 0] } as FailureCluster);
      c.wastedTokens += turn.note.counterfactual.savedTokens;
      c.wastedUsd += turn.costUsd;
      c.trend[day] += 1;
      if (!seen.has(k)) {
        c.runCount += 1;
        seen.add(k);
      }
      acc.set(k, c);
    }
  }

  return [...acc.values()]
    .map((c) => ({ ...c, wastedUsd: Number(c.wastedUsd.toFixed(3)) }))
    .sort((a, b) => b.wastedUsd - a.wastedUsd);
}

// ── 공개 API ──────────────────────────────────────────────

export async function listRuns(): Promise<Run[]> {
  return allRuns();
}

export async function getRun(id: string): Promise<Run | undefined> {
  return allRuns().find((r) => r.id === id);
}

export async function listClusters(): Promise<FailureCluster[]> {
  return buildClusters(allRuns());
}

export async function getOverview(): Promise<Overview> {
  const runs = allRuns();
  return {
    runs24h: runs.length,
    accuracy: Math.round(runs.reduce((a, r) => a + r.score.accuracy, 0) / runs.length),
    accuracyDelta: -6,
    errorRuns: runs.filter((r) => r.status !== "ok").length,
    wastedUsd: Number(
      runs.reduce((a, r) => a + (r.costUsd * r.score.wastedTokenPct) / 100, 0).toFixed(2),
    ),
    wastedPct: Math.round(
      runs.reduce((a, r) => a + r.score.wastedTokenPct, 0) / runs.length,
    ),
    humanInterventions: runs.reduce((a, r) => a + r.humanInterventions, 0),
    accuracyTrend: [82, 79, 84, 77, 81, 74, 76, 71, 73, 69, 72, 68, 71, 66],
  };
}

export const AGENTS = Array.from(new Set(allRuns().map((r) => r.agent)));

/* ── 파생 엔티티 접근자 ────────────────────────────────────
   전부 async 다. 실제 백엔드가 붙으면 본문만 fetch 로 바뀐다.

   한때 Langfuse 의 엔티티를 전부 흉내 냈다 (dataset·prompt·evaluator·queue·
   user·thread). 그건 우리가 이길 수 없는 싸움이었고, 그 화면들에 쓴 시간은
   아무도 하지 않는 것 — 코드 에이전트 세션 — 에 쓰지 않은 시간이었다.
   남은 것은 코드 에이전트를 보는 데 실제로 필요한 것들뿐이다. */

export async function listSessions() {
  const { buildSessions } = await import("@/lib/entities");
  return buildSessions();
}
export async function getSession(id: string) {
  return (await listSessions()).find((s) => s.id === id);
}
/**
 * 한 트레이스에 붙은 스코어.
 *
 * 스코어 **브라우징 화면은 없앴다** — LLM judge 를 등록해 점수를 매기는 화면은
 * "판정에 모델을 쓰지 않는다"는 이 제품의 주장과 정면으로 모순됐다.
 * 다만 SDK 로 들어온 스코어를 트레이스 옆에 보여 주는 것은 남긴다: 그건 우리가
 * 만든 판단이 아니라 사용자가 보낸 사실이다.
 */
export async function scoresForTrace(traceId: string) {
  const { buildScores } = await import("@/lib/entities");
  return buildScores().filter((s) => s.traceId === traceId);
}
/** 세션 간 반복에서 스킬 후보를 뽑는다. LLM 을 쓰지 않는다. */
export async function listSkillCandidates(project?: string) {
  const { buildSkillCandidates } = await import("@/lib/skills");
  return buildSkillCandidates(
    allRuns().filter((run) => !project || run.project === project),
  );
}

export async function getTimeSeries(days = 14) {
  const { buildTimeSeries } = await import("@/lib/entities");
  return buildTimeSeries(days);
}
export async function getByModel() {
  const { buildByModel } = await import("@/lib/entities");
  return buildByModel();
}

/**
 * 사용량 집계. 토큰이 어느 에이전트·작업·도구로 갔는가.
 *
 * 분류는 `lib/usage.ts` 가 도구 이름으로 결정론적으로 한다 — 모델에게 묻지 않는다.
 */
export async function getUsage(days = 30) {
  const { buildUsage } = await import("@/lib/usage");
  return buildUsage(allRuns(), days);
}

/** 트레이스 필터. URL 상태에서 그대로 넘어온다. */
export interface TraceFilter {
  agent?: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  tag?: string;
  status?: RunStatus;
  q?: string;
}

/** 속성 기반 쿼리로 걸러낸다. 파싱·매칭은 lib/query.ts 가 소유한다. */
export async function queryRuns(query: Query): Promise<Run[]> {
  return allRuns().filter((r) => matchRun(r, query));
}

/** 필터 숏컷은 실제 데이터에서 센다 — 손으로 적은 목록은 데이터가 바뀌면 거짓이 된다. */
export async function filterShortcuts() {
  return shortcuts(allRuns());
}

export async function filterRuns(f: TraceFilter): Promise<Run[]> {
  const q = f.q?.trim().toLowerCase();
  return allRuns().filter(
    (r) =>
      (!f.agent || r.agent === f.agent) &&
      (!f.model || r.model === f.model) &&
      (!f.userId || r.userId === f.userId) &&
      (!f.sessionId || r.sessionId === f.sessionId) &&
      (!f.tag || (r.tags ?? []).includes(f.tag)) &&
      (!f.status || r.status === f.status) &&
      (!q ||
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.agent.toLowerCase().includes(q) ||
        (r.userId ?? "").toLowerCase().includes(q)),
  );
}

export const MODELS = Array.from(new Set(allRuns().map((r) => r.model)));
export const TAGS = Array.from(new Set(allRuns().flatMap((r) => r.tags ?? [])));
export const USER_IDS = Array.from(
  new Set(allRuns().map((r) => r.userId).filter(Boolean)),
) as string[];
