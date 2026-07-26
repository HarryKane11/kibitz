import { allRuns } from "@/lib/data";
import { buildTree } from "@/lib/tree";
import type {
  AnnotationQueue,
  Dataset,
  DatasetRun,
  Evaluator,
  MetricSeries,
  Prompt,
  Run,
  Score,
  ScoreDataType,
  SessionSummary,
  TimePoint,
  UserSummary,
} from "@/lib/types";

/**
 * 파생 엔티티.
 *
 * 세션·사용자·스코어는 트레이스에서 **집계**한다 — 별도로 지어내면 두 화면이
 * 서로 다른 숫자를 말하게 된다. 데이터셋·프롬프트·평가자·큐는 트레이스에
 * 없는 개념이라 결정론 시드로 만든다.
 */

function hash(s: string): number {
  return [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
}

const pick = <T,>(arr: readonly T[], n: number): T => arr[n % arr.length];

/* ── 세션 ────────────────────────────────────────────────────── */

export function buildSessions(): SessionSummary[] {
  const bucket = new Map<string, Run[]>();
  for (const r of allRuns()) {
    if (!r.sessionId) continue;
    const list = bucket.get(r.sessionId) ?? [];
    list.push(r);
    bucket.set(r.sessionId, list);
  }
  return [...bucket.entries()]
    .map(([id, runs]) => {
      const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const start = sorted[0].startedAt;
      const last = sorted[sorted.length - 1];
      return {
        id,
        userId: sorted[0].userId,
        traceIds: sorted.map((r) => r.id),
        startedAt: start,
        endedAt: last.startedAt,
        durationMs: runs.reduce((a, r) => a + r.durationMs, 0),
        totalCostUsd: Number(runs.reduce((a, r) => a + r.costUsd, 0).toFixed(3)),
        totalTokens: runs.reduce((a, r) => a + r.totalTokens, 0),
        accuracy: Math.round(runs.reduce((a, r) => a + r.score.accuracy, 0) / runs.length),
      } satisfies SessionSummary;
    })
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/* ── 사용자 ──────────────────────────────────────────────────── */

export function buildUsers(): UserSummary[] {
  const bucket = new Map<string, Run[]>();
  for (const r of allRuns()) {
    if (!r.userId) continue;
    const list = bucket.get(r.userId) ?? [];
    list.push(r);
    bucket.set(r.userId, list);
  }
  return [...bucket.entries()]
    .map(([id, runs]) => ({
      id,
      traceCount: runs.length,
      sessionCount: new Set(runs.map((r) => r.sessionId)).size,
      totalCostUsd: Number(runs.reduce((a, r) => a + r.costUsd, 0).toFixed(3)),
      totalTokens: runs.reduce((a, r) => a + r.totalTokens, 0),
      accuracy: Math.round(runs.reduce((a, r) => a + r.score.accuracy, 0) / runs.length),
      lastSeenAt: runs.map((r) => r.startedAt).sort().slice(-1)[0],
    }))
    .sort((a, b) => b.traceCount - a.traceCount);
}

/* ── 스코어 ──────────────────────────────────────────────────── */

const SCORE_DEFS: {
  name: string;
  dataType: ScoreDataType;
  evaluatorId: string;
  from: (r: Run) => { value: number | null; stringValue: string | null };
}[] = [
  {
    // 계측에서 그대로 나온다 — 모델을 부르지 않는다
    name: "efficiency",
    dataType: "NUMERIC",
    evaluatorId: "ev_efficiency",
    from: (r) => ({ value: Number((r.score.accuracy / 100).toFixed(2)), stringValue: null }),
  },
  {
    name: "no-repeated-call",
    dataType: "BOOLEAN",
    evaluatorId: "ev_repeat",
    from: (r) => {
      const clean = !r.turns.some((t) => t.note?.kind === "repeated-call");
      return { value: clean ? 1 : 0, stringValue: clean ? "true" : "false" };
    },
  },
  {
    name: "token-waste",
    dataType: "NUMERIC",
    evaluatorId: "ev_waste",
    from: (r) => ({ value: r.score.wastedTokenPct, stringValue: null }),
  },
  {
    // 사람이 붙이는 것 — 결정론으로 계산할 수 없는 축이다
    name: "helpfulness",
    dataType: "CATEGORICAL",
    evaluatorId: "",
    from: (r) => {
      const n = hash(r.id) % 10;
      return {
        value: null,
        stringValue: n < 5 ? "helpful" : n < 8 ? "partially_helpful" : "not_helpful",
      };
    },
  },
];

export function buildScores(): Score[] {
  const out: Score[] = [];
  for (const r of allRuns()) {
    for (const def of SCORE_DEFS) {
      const h = hash(r.id + def.name);
      // 사람 어노테이션은 전체 트레이스에 붙지 않는다 — 표본만 있다
      if (def.name === "helpfulness" && h % 3 !== 0) continue;
      const { value, stringValue } = def.from(r);
      out.push({
        id: `score_${r.id}_${def.name}`,
        name: def.name,
        value,
        stringValue,
        dataType: def.dataType,
        source: def.evaluatorId ? "EVAL" : "ANNOTATION",
        evaluatorId: def.evaluatorId || undefined,
        authorUserId: def.evaluatorId ? undefined : "u_reviewer",
        comment:
          def.name === "helpfulness" && stringValue === "not_helpful"
            ? "Answer restated the question without resolving it."
            : undefined,
        traceId: r.id,
        createdAt: r.startedAt,
      });
    }
  }
  return out;
}

/* ── 시계열 ─────────────────────────────────────────────────── */

/** 일 단위 버킷. 실제 트레이스의 startedAt 을 기준으로 모은다. */
export function buildTimeSeries(days = 14): {
  cost: MetricSeries;
  latency: MetricSeries;
  tokens: MetricSeries;
  volume: MetricSeries;
} {
  const runs = allRuns();
  const end = Date.parse("2026-07-26T00:00:00Z");
  const buckets: TimePoint[] = [];

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(end - d * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    // 트레이스가 며칠에 걸쳐 있지 않으므로, 런을 날짜에 결정론적으로 분산한다
    const dayRuns = runs.filter((r) => hash(r.id) % days === days - 1 - d);
    const cost = dayRuns.reduce((a, r) => a + r.costUsd, 0);
    const tok = dayRuns.reduce((a, r) => a + r.totalTokens, 0);
    const lat = dayRuns.map((r) => r.durationMs).sort((a, b) => a - b);
    const q = (p: number) => (lat.length ? lat[Math.floor((lat.length - 1) * p)] : 0);
    buckets.push({
      t: key,
      values: {
        cost: Number(cost.toFixed(3)),
        tokens: tok,
        volume: dayRuns.length,
        p50: q(0.5),
        p95: q(0.95),
        p99: q(0.99),
      },
    });
  }

  const mk = (key: string, label: string): MetricSeries => ({ key, label, points: buckets });
  return {
    cost: mk("cost", "Cost"),
    latency: mk("latency", "Latency"),
    tokens: mk("tokens", "Tokens"),
    volume: mk("volume", "Volume"),
  };
}

/** 모델별 집계 — 4개까지만. 팔레트가 4슬롯이고, 그 이상은 Other 로 접는다. */
export function buildByModel(): { label: string; traces: number; cost: number; tokens: number }[] {
  const m = new Map<string, { traces: number; cost: number; tokens: number }>();
  for (const r of allRuns()) {
    const cur = m.get(r.model) ?? { traces: 0, cost: 0, tokens: 0 };
    cur.traces++;
    cur.cost += r.costUsd;
    cur.tokens += r.totalTokens;
    m.set(r.model, cur);
  }
  const rows = [...m.entries()]
    .map(([label, v]) => ({ label, ...v, cost: Number(v.cost.toFixed(3)) }))
    .sort((a, b) => b.tokens - a.tokens);
  if (rows.length <= 4) return rows;
  const head = rows.slice(0, 3);
  const rest = rows.slice(3);
  return [
    ...head,
    {
      label: "Other",
      traces: rest.reduce((a, r) => a + r.traces, 0),
      cost: Number(rest.reduce((a, r) => a + r.cost, 0).toFixed(3)),
      tokens: rest.reduce((a, r) => a + r.tokens, 0),
    },
  ];
}

/* ── 데이터셋 & 실험 ─────────────────────────────────────────── */

const DATASET_ITEMS = [
  ["What is the Q3 total revenue?", "₩8.24B"],
  ["Which plan includes SSO?", "Enterprise"],
  ["What is the P95 latency target?", "1200ms"],
  ["How long is the standard onboarding?", "30 business days"],
  ["What is the audit log retention period?", "365 days"],
  ["Overage price per extra seat?", "₩48,000 / month"],
  ["Which certifications are held?", "ISO 27001, SOC 2 Type II"],
  ["What is the JWT token lifetime?", "3600 seconds"],
];

function buildDatasetRun(
  datasetId: string,
  idx: number,
  model: string,
  promptVersion: number,
  quality: number,
): DatasetRun {
  const items = DATASET_ITEMS.map(([, expected], i) => {
    const h = hash(`${datasetId}${idx}${i}`);
    const passed = h % 100 < quality;
    return {
      itemId: `item_${i}`,
      actualOutput: passed ? expected : `${expected.slice(0, 4)}… (mismatch)`,
      score: passed ? 1 : Number(((h % 60) / 100).toFixed(2)),
      passed,
      latencyMs: 900 + (h % 2600),
      costUsd: Number(((600 + (h % 3400)) * 0.000005).toFixed(4)),
    };
  });
  const pass = items.filter((i) => i.passed).length;
  return {
    id: `dsrun_${datasetId}_${idx}`,
    name: `run-${idx + 1} · ${model.replace("claude-", "")} · prompt v${promptVersion}`,
    datasetId,
    createdAt: new Date(Date.parse("2026-07-26T00:00:00Z") - idx * 86_400_000).toISOString(),
    model,
    promptVersion,
    items,
    passRate: Math.round((pass / items.length) * 100),
    avgScore: Number((items.reduce((a, i) => a + i.score, 0) / items.length).toFixed(2)),
    totalCostUsd: Number(items.reduce((a, i) => a + i.costUsd, 0).toFixed(4)),
  };
}

export function buildDatasets(): Dataset[] {
  const id = "ds_docqa";
  return [
    {
      id,
      name: "doc-qa-golden",
      description:
        "Fixed questions with verified answers pulled from the policy documents. Run it against a prompt version to see whether a change regressed anything.",
      items: DATASET_ITEMS.map(([input, expectedOutput], i) => ({
        id: `item_${i}`,
        input,
        expectedOutput,
      })),
      runs: [
        buildDatasetRun(id, 0, "claude-opus-5", 4, 88),
        buildDatasetRun(id, 1, "claude-opus-5", 3, 75),
        buildDatasetRun(id, 2, "claude-sonnet-5", 3, 63),
      ],
      updatedAt: "2026-07-26T00:00:00Z",
    },
    {
      id: "ds_regression",
      name: "failure-regression",
      description:
        "Inputs that previously triggered a detected failure mode. A run here should stay clean; a drop means a regression.",
      items: DATASET_ITEMS.slice(0, 5).map(([input, expectedOutput], i) => ({
        id: `item_${i}`,
        input,
        expectedOutput,
      })),
      runs: [
        buildDatasetRun("ds_regression", 0, "claude-opus-5", 4, 92),
        buildDatasetRun("ds_regression", 1, "claude-opus-5", 2, 58),
      ],
      updatedAt: "2026-07-25T00:00:00Z",
    },
  ];
}

/* ── 프롬프트 ────────────────────────────────────────────────── */

export function buildPrompts(): Prompt[] {
  return [
    {
      id: "p_docqa",
      name: "doc-qa-system",
      type: "text",
      updatedAt: "2026-07-24T00:00:00Z",
      versions: [
        {
          version: 4,
          labels: ["production", "latest"],
          content:
            "You answer questions from the attached policy documents.\n\nGround every number in a document. If a figure is not in the sources, say so instead of estimating.\nCite the document id for each claim.\nIf the catalog returns nothing, widen the query before trying again — never repeat the same search.",
          config: { model: "claude-opus-5", temperature: 0, max_tokens: 2048 },
          createdAt: "2026-07-24T00:00:00Z",
          authorUserId: "u_hyeonwoo",
          usageCount: 412,
          commitMessage: "Add explicit no-repeat instruction after seeing repeated-call in prod",
        },
        {
          version: 3,
          labels: ["staging"],
          content:
            "You answer questions from the attached policy documents.\n\nGround every number in a document. If a figure is not in the sources, say so instead of estimating.\nCite the document id for each claim.",
          config: { model: "claude-opus-5", temperature: 0, max_tokens: 2048 },
          createdAt: "2026-07-18T00:00:00Z",
          authorUserId: "u_jimin",
          usageCount: 1284,
          commitMessage: "Require citations",
        },
        {
          version: 2,
          labels: [],
          content:
            "You answer questions from the attached policy documents.\n\nGround every number in a document.",
          config: { model: "claude-opus-5", temperature: 0.2, max_tokens: 1024 },
          createdAt: "2026-07-09T00:00:00Z",
          authorUserId: "u_jimin",
          usageCount: 630,
          commitMessage: "Add grounding rule",
        },
        {
          version: 1,
          labels: [],
          content: "You answer questions from the attached policy documents.",
          config: { model: "claude-sonnet-5", temperature: 0.7, max_tokens: 1024 },
          createdAt: "2026-07-02T00:00:00Z",
          authorUserId: "u_jimin",
          usageCount: 118,
          commitMessage: "Initial",
        },
      ],
    },
    {
      id: "p_triage",
      name: "ticket-triage",
      type: "chat",
      updatedAt: "2026-07-21T00:00:00Z",
      versions: [
        {
          version: 2,
          labels: ["production", "latest"],
          content:
            "system: Classify the ticket into exactly one severity: S1, S2, or S3.\nuser: {{ticket_body}}",
          config: { model: "claude-haiku-4-5", max_tokens: 64 },
          createdAt: "2026-07-21T00:00:00Z",
          authorUserId: "u_taeyang",
          usageCount: 2940,
          commitMessage: "Force single-label output",
        },
        {
          version: 1,
          labels: [],
          content: "system: Classify the ticket severity.\nuser: {{ticket_body}}",
          config: { model: "claude-haiku-4-5", max_tokens: 256 },
          createdAt: "2026-07-11T00:00:00Z",
          authorUserId: "u_taeyang",
          usageCount: 810,
          commitMessage: "Initial",
        },
      ],
    },
  ];
}

/* ── 평가자 ──────────────────────────────────────────────────── */

export function buildEvaluators(): Evaluator[] {
  const scores = buildScores();
  const count = (id: string) => scores.filter((s) => s.evaluatorId === id).length;
  return [
    {
      id: "ev_repeat",
      name: "no-repeated-call",
      kind: "deterministic",
      scoreName: "no-repeated-call",
      dataType: "BOOLEAN",
      rule: "hash(tool, args) == previous call AND no write to that target in between",
      enabled: true,
      target: "trace",
      lastRunAt: "2026-07-26T09:00:00Z",
      scoresProduced: count("ev_repeat"),
    },
    {
      id: "ev_efficiency",
      name: "efficiency",
      kind: "deterministic",
      scoreName: "efficiency",
      dataType: "NUMERIC",
      rule: "turns with intended result / total turns",
      enabled: true,
      target: "trace",
      lastRunAt: "2026-07-26T09:00:00Z",
      scoresProduced: count("ev_efficiency"),
    },
    {
      id: "ev_waste",
      name: "token-waste",
      kind: "deterministic",
      scoreName: "token-waste",
      dataType: "NUMERIC",
      rule: "tokens spent on waste|error turns / total tokens",
      enabled: true,
      target: "trace",
      lastRunAt: "2026-07-26T09:00:00Z",
      scoresProduced: count("ev_waste"),
    },
    {
      id: "ev_grounded",
      name: "answer-grounded",
      kind: "model",
      scoreName: "answer-grounded",
      dataType: "BOOLEAN",
      model: "claude-opus-5",
      enabled: false,
      target: "trace",
      lastRunAt: "—",
      scoresProduced: 0,
    },
    {
      id: "ev_helpful",
      name: "helpfulness",
      kind: "human",
      scoreName: "helpfulness",
      dataType: "CATEGORICAL",
      enabled: true,
      target: "trace",
      lastRunAt: "2026-07-25T18:00:00Z",
      scoresProduced: scores.filter((s) => s.name === "helpfulness").length,
    },
  ];
}

/* ── 어노테이션 큐 ───────────────────────────────────────────── */

export function buildQueues(): AnnotationQueue[] {
  const runs = allRuns();
  const flagged = runs.filter((r) => r.status !== "ok").slice(0, 9);
  return [
    {
      id: "q_helpfulness",
      name: "helpfulness-review",
      description:
        "Runs that a deterministic rule flagged. A rule can say a run was wasteful; only a person can say whether the answer helped.",
      scoreName: "helpfulness",
      dataType: "CATEGORICAL",
      options: ["helpful", "partially_helpful", "not_helpful"],
      items: flagged.map((r, i) => ({
        id: `aq_${r.id}`,
        traceId: r.id,
        traceTitle: r.title + (r.titleTail ?? ""),
        // 사람이 읽는 문장은 화면에서 사전으로 만든다. 여기서는 규칙 이름만 남긴다.
        reasonKind: r.turns.find((t) => t.note)?.note?.kind,
        status: i < 3 ? ("done" as const) : ("pending" as const),
        scoreName: "helpfulness",
        options: ["helpful", "partially_helpful", "not_helpful"],
        submittedValue: i < 3 ? pick(["helpful", "partially_helpful", "not_helpful"], i) : undefined,
      })),
    },
  ];
}

/* ══════════════════════════════════════════════════════════════
   Threads — LangSmith 의 대화 단위
   ══════════════════════════════════════════════════════════════ */

/**
 * 대화의 한 턴.
 *
 * 요청 묶음(chain 루트) 하나가 곧 한 턴이다. 사용자가 말하고 에이전트가 그 아래에서
 * 일한 뒤 답한다 — 그 경계가 이미 데이터에 있으므로 대화를 새로 추론하지 않는다.
 */
export interface ThreadTurn {
  runId: string;
  /** 이 턴의 chain 루트 index */
  index: number;
  userText: string;
  answerText?: string;
  durationMs: number;
  costUsd: number;
  /** 이 턴 아래에서 나온 판정 수 */
  verdicts: number;
  observations: number;
  attachments: number;
}

export interface Thread {
  id: string;
  userId?: string;
  runIds: string[];
  turns: ThreadTurn[];
  startedAt: string;
  totalCostUsd: number;
}

/** 한 런 안의 요청 묶음들을 대화 턴으로 편다. */
function turnsOfRun(run: Run): ThreadTurn[] {
  return buildTree(run.turns)
    .filter((n) => n.turn.obsType === "chain")
    .map((n) => {
      // 답변은 이 묶음 아래의 마지막 llm 관측이다. 없으면 답 없이 끝난 턴이다.
      const answer = [...n.children].reverse().find((c) => c.turn.obsType === "llm");
      return {
        runId: run.id,
        index: n.turn.index,
        userText: n.turn.utterance ?? n.turn.output,
        answerText: answer?.turn.output,
        durationMs: n.rollup.durationMs,
        costUsd: Number(n.rollup.costUsd.toFixed(4)),
        verdicts: n.rollup.errors + n.rollup.wastes,
        observations: n.rollup.descendants,
        attachments: n.turn.attachments ?? 0,
      } satisfies ThreadTurn;
    });
}

export function buildThreads(): Thread[] {
  const bucket = new Map<string, Run[]>();
  for (const r of allRuns()) {
    const key = r.sessionId ?? r.id;
    bucket.set(key, [...(bucket.get(key) ?? []), r]);
  }
  return [...bucket.entries()]
    .map(([id, runs]) => {
      const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return {
        id,
        userId: sorted[0].userId,
        runIds: sorted.map((r) => r.id),
        turns: sorted.flatMap(turnsOfRun),
        startedAt: sorted[0].startedAt,
        totalCostUsd: Number(runs.reduce((a, r) => a + r.costUsd, 0).toFixed(3)),
      } satisfies Thread;
    })
    .filter((th) => th.turns.length > 0)
    .sort((a, b) => b.turns.length - a.turns.length);
}
