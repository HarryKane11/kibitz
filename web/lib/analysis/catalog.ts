/**
 * 분석 모듈의 공용 계약. 서버·클라이언트가 함께 쓰므로 순수 타입과 데이터만 둔다.
 *
 * 제공자 호출은 `providers.ts`, 실행은 `run.ts` 에 있고 둘 다 server-only 다.
 */

export type ProviderId =
  | "claude-code"
  | "codex-cli"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "ollama";

export type ProviderAuthMode = "cli-session" | "api-key" | "local";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  authMode: ProviderAuthMode;
  /** 키가 필요한가. ollama 는 로컬이라 필요 없다. */
  needsKey: boolean;
  /** 비워 두면 제공자의 현재 기본 모델을 쓸 수 있는가. */
  requiresModel: boolean;
  /** 서버에 두면 브라우저가 키를 보지 않는다 */
  envKey?: string;
  defaultModel: string;
  /** 모델 이름을 어디서 찾는지 — 우리가 목록을 들고 있으면 반드시 낡는다 */
  modelsHint: string;
}

/**
 * 기본 모델은 **제안**이다. 모델 이름은 우리가 통제하지 않는 속도로 바뀌므로
 * 화면에서 고칠 수 있어야 한다 — 그래서 입력 필드다.
 */
export const PROVIDERS: ProviderSpec[] = [
  {
    id: "claude-code",
    label: "Claude Code account",
    authMode: "cli-session",
    needsKey: false,
    requiresModel: false,
    defaultModel: "",
    modelsHint: "Uses the model selected by your installed Claude Code",
  },
  {
    id: "codex-cli",
    label: "Codex account",
    authMode: "cli-session",
    needsKey: false,
    requiresModel: false,
    defaultModel: "",
    modelsHint: "Uses the model selected by your installed Codex CLI",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    authMode: "api-key",
    needsKey: true,
    requiresModel: true,
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-5",
    modelsHint: "platform.claude.com/docs — models overview",
  },
  {
    id: "openai",
    label: "OpenAI",
    authMode: "api-key",
    needsKey: true,
    requiresModel: true,
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5.4",
    modelsHint: "platform.openai.com/docs/models",
  },
  {
    id: "google",
    label: "Google",
    authMode: "api-key",
    needsKey: true,
    requiresModel: true,
    envKey: "GOOGLE_API_KEY",
    defaultModel: "gemini-3.1-pro-preview",
    modelsHint: "ai.google.dev/gemini-api/docs/models",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    authMode: "api-key",
    needsKey: true,
    requiresModel: true,
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-opus-5",
    modelsHint: "openrouter.ai/models",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    authMode: "local",
    needsKey: false,
    requiresModel: true,
    defaultModel: "",
    modelsHint: "ollama list",
  },
];

export function providerSpec(id: string): ProviderSpec | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** 화면이 받는 제공자 상태. **키 값은 절대 여기 담기지 않는다** — 설정 여부만. */
export interface ProviderStatus {
  id: ProviderId;
  label: string;
  authMode: ProviderAuthMode;
  needsKey: boolean;
  requiresModel: boolean;
  /** 서버 환경변수에 키가 있는가 */
  configured: boolean;
  defaultModel: string;
  modelsHint: string;
  /** CLI 계정 로그인 명령. 자격증명 값은 포함하지 않는다. */
  loginCommand?: string;
  /** UI에서 로컬 로그인 프로세스를 시작할 수 있는가. */
  loginAvailable?: boolean;
  /**
   * 붙여 넣은 키를 서버가 거부하는가 (공개 배포).
   *
   * `configured: false` 와 다르다 — 그건 "키를 넣으면 된다"는 뜻이고, 이건 "넣어도
   * 안 받는다"는 뜻이다. 화면이 둘을 구분하지 못하면 입력란을 띄워 놓고 실패시킨다.
   */
  keysBlocked?: boolean;
  /** ollama 를 실제로 물어봤을 때만 채워진다 — 로컬에 내려받힌 모델 */
  models?: string[];
  /** 지금 쓸 수 없는 이유 (닿지 않는 ollama 등) */
  unavailable?: string;
}

/* ── 분석 요청 / 결과 ─────────────────────────────────────────
   서버 액션과 `POST /api/analyze` 가 같은 모양을 쓴다. 두 입구가 다르게 생기면
   한쪽만 고쳐지고, 그때 어느 쪽이 맞는지 알 수 없게 된다. */

export interface AnalyzeInput {
  runId: string;
  provider: string;
  model?: string;
  /** 브라우저가 넣은 키. 이 요청에만 쓰이고 저장되지 않는다. */
  apiKey?: string;
  baseUrl?: string;
  /** 도구 인자를 지우고 보낼지 (경로·질의가 제3자에게 나가지 않는다) */
  redactArgs?: boolean;
}

export interface AnalyzeSuggestion {
  title: string;
  why: string;
  change: string;
  /** 이 제안이 근거로 든 관측 번호 */
  observations: number[];
  kinds: string[];
  /** 브리프에 없는 번호 — 모델이 지어낸 것이다 */
  ungrounded: number[];
}

export interface AnalyzeOk {
  ok: true;
  provider: string;
  model: string;
  usage: { input: number; output: number } | null;
  /** 제공자가 스키마를 강제했는가. 안 했으면 파싱 실패가 정상 범위 안이다. */
  schemaEnforced: boolean;
  citationRule: string;
  summary: string;
  suggestions: AnalyzeSuggestion[];
  brief: { chars: number; verdicts: number; redacted: boolean };
}

export interface AnalyzeFail {
  ok: false;
  error: string;
  status: number;
  /** 파싱이 깨졌을 때의 모델 원문 앞부분 */
  raw?: string;
}

export type AnalyzeOutcome = AnalyzeOk | AnalyzeFail;

/**
 * 저장된 분석 하나.
 *
 * `createdAt`·`provider`·`model` 이 반드시 붙는다 — 6개월 뒤에 이 글을 보는 사람이
 * "언제 어느 모델이 썼나"를 알 수 있어야 계산된 판정과 혼동하지 않는다.
 */
export interface SavedAnalysis {
  id: string;
  runId: string;
  createdAt: string;
  provider: string;
  model: string;
  usage: { input: number; output: number } | null;
  schemaEnforced: boolean;
  citationRule: string;
  summary: string;
  suggestions: AnalyzeSuggestion[];
  brief: { chars: number; verdicts: number; redacted: boolean };
}

export interface CliLoginStart {
  ok: boolean;
  sessionId?: string;
  command: string;
  error?: string;
}

export interface CliLoginPoll {
  found: boolean;
  output: string;
  done: boolean;
  success: boolean;
}
