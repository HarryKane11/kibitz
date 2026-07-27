/**
 * Kibitz 도메인 모델.
 *
 * ── 원칙: 화면에 뜨는 모든 값은 계측에서 직접 관측된다 ──
 *
 * LLM 판정을 쓰지 않는다. 모델에게 "이거 잘했니?"를 묻는 순간
 * 그 답 자체가 또 하나의 환각 후보가 되고, 사람은 그걸 검증할 수 없다.
 * 그래서 이 모델에는 모델의 자기보고(확신도 등)나 추정 점수가 없다.
 *
 * 전부 아래 셋 중 하나에서 나온다:
 *   1. span attribute (도구명, 인자, 지연, 토큰, 결과 크기)
 *   2. 실제 전송된 messages 배열 (역할별 토큰 구성, 메시지 소실)
 *   3. 문자열 연산 (해시 비교, 숫자 리터럴 매칭, 부분열 탐지)
 */

export type Verdict = "good" | "waste" | "error" | "human";

/**
 * 국면. **키만** 저장하고 표시 문자열은 사전에서 온다 —
 * 데이터에 사람 말이 섞이면 그 순간 다국어가 불가능해진다.
 */
export type Phase = "plan" | "gather" | "reason" | "deliver";

export const PHASES: Phase[] = ["plan", "gather", "reason", "deliver"];

export type TurnKind = "user" | "decision" | "answer" | "human";

/**
 * 탐지 규칙. 여섯 개 전부 LLM 없이 계산된다.
 *
 * | 규칙 | 계산 방법 |
 * |---|---|
 * | repeated-call    | hash(tool, args) 가 직전 호출과 동일 |
 * | call-cycle       | 호출 시퀀스에서 길이 2+ 부분열이 반복 |
 * | empty-result-loop| 결과 0건 뒤 인자 변경 없이 재호출 |
 * | context-eviction | 호출 N의 message id 집합 ⊅ 호출 N+1 |
 * | unsourced-number | 출력의 숫자 리터럴이 어떤 소스에도 없음 |
 */
export type FailureKind =
  | "repeated-call"
  | "call-cycle"
  | "empty-result-loop"
  | "context-eviction"
  | "cache-break"
  | "unsourced-number";

/** 근거 항목의 이름. 사전 `evidence` 네임스페이스의 키다. */
export type EvidenceKey =
  | "tool"
  | "argHash"
  | "nextArgHash"
  | "writesBetween"
  | "newRecords"
  | "repeatedSubsequence"
  | "startTurn"
  | "result"
  | "resultCount"
  | "nextCall"
  | "cacheRead"
  | "cacheWrite"
  | "repaidTokens"
  | "missingMessage"
  | "messageCount"
  | "historyTokens"
  | "retrievalTokens"
  | "comparedNumbers"
  | "sourced"
  | "unsourced"
  | "relatedLookups";

/** 값 자체가 사람 말인 소수의 경우. 나머지는 숫자·해시·도구명이라 번역이 필요 없다. */
export type EvidenceValueKey = "none" | "empty" | "decreased" | "zeroCalls";

/**
 * 판정의 근거.
 *
 * 사람이 "왜 이게 문제라는 건데?"라고 물었을 때 보여줄 실제 관측치.
 * 이게 없으면 우리도 그냥 믿으라는 소리를 하는 것이다.
 */
export interface Evidence {
  /** 관측 항목 이름 (사전 키) */
  label: EvidenceKey;
  /** 관측된 값 그대로. valueKey 가 있으면 무시된다. */
  value: string;
  /** 값이 리터럴이 아니라 개념일 때 */
  valueKey?: EvidenceValueKey;
  /** 비교 대상이 있는 경우 (예: 직전 호출의 해시) */
  compare?: string;
  /** compare 앞에 "턴 N ·" 을 붙인다 */
  compareTurn?: number;
  /** 두 값이 같아서 문제인지, 달라서 문제인지 */
  relation?: "same" | "missing" | "absent";
}

/** 반사실 — "대신 이렇게 했어야 했다". 문장은 kind 로 사전에서 뽑는다. */
export interface Counterfactual {
  savedTurns: number;
  savedMs: number;
  savedTokens: number;
}

/**
 * 판정.
 *
 * headline / why / 대안 경로는 **여기에 없다**. 전부 `kind` 로 사전에서 온다.
 * 규칙이 여섯 개뿐이고 문장이 규칙마다 고정이므로, 데이터에 프로즈를 넣으면
 * 같은 문장이 런 수만큼 복제되고 번역도 불가능해진다.
 */
export interface VerdictNote {
  kind: FailureKind;
  /** 이 판정을 뒷받침하는 관측치 */
  evidence: Evidence[];
  counterfactual: Counterfactual;
}

/** 컨텍스트 창을 채운 구성 요소. 키만 저장한다. */
export type ContextRole =
  | "system"
  | "skills"
  | "tools"
  | "history"
  | "retrieval"
  | "cacheRead"
  | "cacheWrite"
  | "freshInput"
  | "output";

/** 어떤 LLM 호출 시점에 컨텍스트 창을 무엇이 채웠는가 (토큰 실측) */
export interface ContextFrame {
  label: ContextRole;
  tokens: number;
}

/** 도구 호출이 반환한 레코드의 식별자. 중복 판정과 출처 추적에 쓴다. */
export interface RecordRef {
  id: string;
  label: string;
}

/** 턴 제목이 우리가 붙인 말일 때. 모델 자신의 문장이면 title 을 그대로 쓴다. */
export type TurnTitleKey = "userRequest" | "returnAnswer" | "runTool" | "interrupted";

/**
 * 관측 종류 (LangSmith run type).
 *
 * 트리에서 아이콘·색을 결정한다. 도구 이름에서 결정론적으로 나온다.
 *   chain     사용자 요청 하나 — 이후 작업 전체를 지배하는 묶음의 뿌리
 *   llm       모델이 도구 없이 말한 것
 *   retriever 정보를 가져오는 호출 (Read/Grep/WebFetch…)
 *   tool      상태를 바꾸는 호출 (Edit/Write/Bash…)
 *   agent     하위 에이전트에게 위임
 *   event     지점 사건 (사람의 개입 등). 지속시간이 의미 없다.
 */
export type ObsType = "chain" | "llm" | "retriever" | "tool" | "agent" | "event";

/** 호출 결과를 한 마디로. 숫자가 아닌 결과는 키로 표현한다. */
export type TurnResultKey = "ok" | "empty" | "sent" | "records";

export interface Turn {
  index: number;
  phase: Phase;
  kind: TurnKind;
  verdict: Verdict;
  obsType: ObsType;

  /**
   * 부모 관측의 index. 없으면 트레이스 루트다.
   *
   * 계층은 우리가 만든 게 아니라 기록에 있다 — 사용자 요청 하나가 이후 에이전트
   * 작업 전체를 지배하고, 그 경계가 곧 묶음이다. 160턴 런이 접을 수 있는
   * 6개 묶음이 되므로 긴 런의 스크롤 지옥이 사라진다.
   */
  parentIndex?: number;

  /** 트레이스 시작 기준 오프셋(ms). waterfall 의 x 좌표. */
  startOffsetMs: number;

  /** 이 요청에 함께 온 첨부(스크린샷 등) 수 */
  attachments?: number;
  /** 모델 자신의 문장. titleKey 가 있으면 그쪽이 우선한다. */
  title: string;
  /** 우리가 붙인 제목일 때의 사전 키 */
  titleKey?: TurnTitleKey;
  /** titleKey === "runTool" 일 때의 도구 이름 */
  titleTool?: string;
  utterance?: string;

  call?: string;
  /** hash(tool, args). 반복 호출 탐지의 근거값 그 자체다. */
  callHash?: string;
  resultKey?: TurnResultKey;
  /** resultKey === "records" 일 때의 개수 */
  resultCount?: number;
  /** 이번 호출이 돌려준 레코드 */
  returned?: RecordRef[];

  durationMs: number;
  tokens: number;
  costUsd: number;

  /**
   * 이 턴까지 누적으로 확보한 **고유** 레코드 수.
   *
   * 지어낸 진행도 점수 대신 쓰는 실측값이다.
   * 에이전트가 헛돌면 이 값이 늘지 않아 곡선이 평평해진다 —
   * 설명할 필요 없이 눈에 보인다.
   */
  recordsKnown: number;

  /** 실제 전송된 messages를 역할별로 합산한 토큰 */
  context: ContextFrame[];
  /** 이 호출 시점의 message id 집합. 절단 탐지에 쓴다. */
  messageIds?: string[];

  prompt?: string;
  output: string;
  note?: VerdictNote;
}

/** 출력에서 뽑은 숫자 리터럴 하나와 그 출처 */
export interface NumberClaim {
  text: string;
  /** 이 숫자가 처음 등장한 턴. null 이면 어떤 소스에도 없다. */
  sourceTurn: number | null;
}

export interface PhaseScore {
  phase: Phase;
  accuracy: number;
}

export interface RunScore {
  accuracy: number;
  errors: number;
  wastes: number;
  wastedTokenPct: number;
  phases: PhaseScore[];
}

export type RunStatus = "ok" | "degraded" | "failed";

export interface Run {
  id: string;
  project: string;
  agent: string;
  /**
   * 어느 코드 에이전트에서 왔는가 (claude-code · codex …).
   *
   * 어댑터마다 기록의 풍부함이 다르다 — Codex 는 턴 소요시간과 압축 이벤트를 직접
   * 주고, Claude Code 는 추론해야 한다. 화면이 그 차이를 말할 수 있어야 사용자가
   * 없는 정밀도를 기대하지 않는다.
   */
  source?: string;
  /** 이 실행이 속한 세션. 같은 세션의 실행들은 이어지는 하나의 작업이다. */
  sessionId?: string;
  /** 최종 사용자 식별자 */
  userId?: string;
  tags?: string[];
  release?: string;
  environment?: string;
  title: string;
  titleTail?: string;
  model: string;
  startedAt: string;
  /** 에이전트가 실제로 일한 시간. 사람을 기다린 시간은 여기 없다. */
  durationMs: number;
  /**
   * 사람을 기다린 시간.
   *
   * 이벤트 타임스탬프만으로는 "간격"이 에이전트 작업과 사람의 부재를 함께 담는다.
   * 둘을 합쳐 지연이라 부르면 p95 가 무의미해진다 — 실측에서 66시간짜리 간격이 나왔다.
   */
  idleMs?: number;
  /** 원본 이벤트가 수집 상한을 넘었을 때만 존재한다. 조용히 잘린 런을 만들지 않는다. */
  truncation?: { captured: number; available: number } | null;
  totalTokens: number;
  costUsd: number;
  /** 인제스터가 제공자별 가격표 없이 토큰으로 근사한 비용인지. */
  costEstimated?: boolean;
  humanInterventions: number;
  status: RunStatus;
  score: RunScore;
  turns: Turn[];
  registeredTools: number;
  usedTools: number;
  /** 미사용 도구 정의가 매 호출마다 먹는 토큰 (실측) */
  unusedToolTokens: number;
  /** 최종 답변과 그 안 숫자들의 출처 */
  answer?: { text: string; claims: NumberClaim[] };
  /**
   * 아직 돌고 있는가.
   *
   * `status` 와 섞지 않는다 — 그건 "잘했나"에 대한 판정이고 이건 "끝났나"에 대한
   * 사실이다. 둘을 한 필드에 넣으면 진행 중인 런의 정확도를 물었을 때 답이 없어진다.
   *
   * 루트 스팬이 아직 닫히지 않았고 마지막 스팬이 방금 도착했으면 열려 있다.
   * 실시간 감시는 이 값 하나에 달려 있다.
   */
  open?: boolean;
  /** 마지막 스팬이 도착한 시각. 열린 런의 "살아 있음" 판정에 쓴다. */
  updatedAt?: string;
  /** 지금까지 받은 스팬 수. 배치가 이어 들어오면 늘어난다. */
  spanCount?: number;
}

/**
 * 같은 방식으로 실패한 런들의 묶음. 이름과 설명은 `kind` 로 사전에서 온다 —
 * 규칙이 곧 유형이므로 따로 이름을 붙이면 두 곳이 어긋난다.
 */
export interface FailureCluster {
  kind: FailureKind;
  runCount: number;
  wastedTokens: number;
  wastedUsd: number;
  trend: number[];
}

export interface Overview {
  runs24h: number;
  accuracy: number;
  accuracyDelta: number;
  errorRuns: number;
  wastedUsd: number;
  wastedPct: number;
  humanInterventions: number;
  accuracyTrend: number[];
}

/**
 * 각 규칙이 무엇을 계산하는지. 화면에 그대로 노출한다.
 *
 * 이 하나만 번역하지 않는다 — 수식이지 문장이 아니고,
 * 계측 코드와 글자 그대로 대조할 수 있어야 근거로서 값이 있다.
 */
export const FAILURE_RULE: Record<FailureKind, string> = {
  "repeated-call": "hash(tool, args) == previous call",
  "call-cycle": "repeating subsequence of length ≥ 2 in the call sequence",
  "empty-result-loop": "0 results, then no change in args",
  "context-eviction": "message id present in call N, absent in call N+1",
  "cache-break": "cache_read collapses while cache_write spikes",
  "unsourced-number": "numeric literal in output ∉ (tool output ∪ user input)",
};

/* ══════════════════════════════════════════════════════════════
   Langfuse 호환 엔티티
   ──────────────────────────────────────────────────────────────
   위쪽 Run/Turn 은 "결정"을 1차 객체로 보는 우리 모델이다.
   아래는 Langfuse 가 쓰는 엔티티를 같은 데이터 위에 얹은 것으로,
   트레이스를 세션·사용자·스코어·데이터셋 축에서도 볼 수 있게 한다.

   Run      ↔ Trace        (한 번의 실행)
   Turn     ↔ Observation  (실행 안의 한 단계)
   ══════════════════════════════════════════════════════════════ */

/** 관측 종류. generation 만 모델 호출이고 토큰·비용이 붙는다. */
export type ObservationType = "span" | "generation" | "event";

export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

/** 스코어의 값 종류. Langfuse 와 동일하게 셋으로 나눈다. */
export type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/**
 * 스코어가 어디서 왔는가.
 *
 * `EVAL` 중에서도 결정론 규칙과 모델 채점은 신뢰도가 다르다.
 * 그 구분은 Evaluator.kind 가 들고 있고, 스코어는 어떤 평가자가 만들었는지만 가리킨다.
 */
export type ScoreSource = "ANNOTATION" | "EVAL" | "API";

export interface Score {
  id: string;
  name: string;
  /** NUMERIC 이면 숫자, 아니면 stringValue 를 본다 */
  value: number | null;
  stringValue: string | null;
  dataType: ScoreDataType;
  source: ScoreSource;
  comment?: string;
  /** 붙은 대상 — 트레이스 전체이거나 그 안의 한 관측 */
  traceId: string;
  observationIndex?: number;
  evaluatorId?: string;
  authorUserId?: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  userId?: string;
  traceIds: string[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalCostUsd: number;
  totalTokens: number;
  /** 세션 내 트레이스들의 평균 정확도 */
  accuracy: number;
}

export interface UserSummary {
  id: string;
  traceCount: number;
  sessionCount: number;
  totalCostUsd: number;
  totalTokens: number;
  accuracy: number;
  lastSeenAt: string;
}

/* ── 데이터셋 & 실험 ─────────────────────────────────────────── */

export interface DatasetItem {
  id: string;
  input: string;
  expectedOutput: string;
  metadata?: Record<string, string>;
}

export interface DatasetRunItem {
  itemId: string;
  actualOutput: string;
  /** 이 항목이 이 실행에서 받은 점수 (0~1) */
  score: number;
  passed: boolean;
  traceId?: string;
  latencyMs: number;
  costUsd: number;
}

export interface DatasetRun {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  model: string;
  promptVersion?: number;
  items: DatasetRunItem[];
  passRate: number;
  avgScore: number;
  totalCostUsd: number;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  items: DatasetItem[];
  runs: DatasetRun[];
  updatedAt: string;
}

/* ── 프롬프트 관리 ───────────────────────────────────────────── */

export type PromptType = "text" | "chat";

export interface PromptVersion {
  version: number;
  content: string;
  /** production / staging / latest 같은 배포 라벨 */
  labels: string[];
  config: Record<string, string | number>;
  createdAt: string;
  authorUserId: string;
  /** 이 버전을 참조한 트레이스 수 */
  usageCount: number;
  commitMessage: string;
}

export interface Prompt {
  id: string;
  name: string;
  type: PromptType;
  versions: PromptVersion[];
  updatedAt: string;
}

/* ── 평가자 ──────────────────────────────────────────────────── */

/**
 * 평가자의 종류가 신뢰도를 결정한다.
 *
 * `deterministic` 은 계측값만 보므로 근거와 판정 조건을 그대로 보여줄 수 있다.
 * `model` 은 모델을 부르므로 토큰을 쓰고 틀릴 수 있다 — 사실이 아니라 신호로 다뤄야 한다.
 * 화면은 이 둘을 절대 같은 무게로 그리지 않는다.
 */
export type EvaluatorKind = "deterministic" | "model" | "human";

export interface Evaluator {
  id: string;
  name: string;
  kind: EvaluatorKind;
  /** 이 평가자가 만들어내는 스코어 이름 */
  scoreName: string;
  dataType: ScoreDataType;
  /** 결정론 규칙이면 그 규칙의 계산식 */
  rule?: string;
  /** 모델 채점이면 쓰는 모델 */
  model?: string;
  enabled: boolean;
  target: "trace" | "observation";
  lastRunAt: string;
  scoresProduced: number;
}

/* ── 어노테이션 큐 ───────────────────────────────────────────── */

export interface AnnotationItem {
  id: string;
  traceId: string;
  traceTitle: string;
  /** 사람이 봐야 하는 이유 */
  /** 이 트레이스가 큐에 오른 이유. 규칙에서 왔으면 그 규칙, 아니면 런 상태다. */
  reasonKind?: FailureKind;
  status: "pending" | "done";
  scoreName: string;
  options: string[];
  submittedValue?: string;
  submittedComment?: string;
}

export interface AnnotationQueue {
  id: string;
  name: string;
  description: string;
  scoreName: string;
  dataType: ScoreDataType;
  options: string[];
  items: AnnotationItem[];
}

/* ── 시계열 ─────────────────────────────────────────────────── */

export interface TimePoint {
  /** ISO 날짜 (일 단위 버킷) */
  t: string;
  values: Record<string, number>;
}

export interface MetricSeries {
  key: string;
  label: string;
  points: TimePoint[];
}

export const SCORE_SOURCE_KEY: Record<ScoreSource, "sourceAnnotation" | "sourceEval" | "sourceApi"> =
  { ANNOTATION: "sourceAnnotation", EVAL: "sourceEval", API: "sourceApi" };

export const SCORE_TYPE_KEY: Record<
  ScoreDataType,
  "typeNumeric" | "typeCategorical" | "typeBoolean"
> = { NUMERIC: "typeNumeric", CATEGORICAL: "typeCategorical", BOOLEAN: "typeBoolean" };

export const EVALUATOR_KIND_KEY: Record<
  EvaluatorKind,
  "kindDeterministic" | "kindModel" | "kindHuman"
> = { deterministic: "kindDeterministic", model: "kindModel", human: "kindHuman" };
