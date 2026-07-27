import type { BrandKey } from "@/lib/brand-marks";

/**
 * 식별자 → 브랜드 마크.
 *
 * 세 종류의 식별자가 화면에 나온다. 셋 다 우리가 만든 게 아니라 **받은 문자열**
 * 이므로, 못 알아보면 `null` 을 돌려주고 호출부는 마크 없이 이름만 쓴다.
 * 억지로 맞추면 (예: 모르는 모델을 전부 openai 로) 화면이 조용히 거짓말을 한다.
 */

/** 분석 제공자 — `ProviderId` 와 1:1 이다. */
const BY_PROVIDER: Record<string, BrandKey> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  openrouter: "openrouter",
  ollama: "ollama",
  "claude-code": "claudeCode",
  "codex-cli": "codex",
};

/** 트레이스 소스 — 인제스터가 붙인다. `sdk` 는 브랜드가 아니라 우리 어댑터다. */
const BY_SOURCE: Record<string, BrandKey> = {
  "claude-code": "claudeCode",
  claude_code: "claudeCode",
  codex: "codex",
  "codex-cli": "codex",
  langchain: "langchain",
  langgraph: "langchain",
  otlp: "opentelemetry",
  opentelemetry: "opentelemetry",
  openinference: "opentelemetry",
};

/**
 * 모델 이름 → 만든 곳. **접두사로만** 판단한다.
 *
 * OpenRouter 는 `anthropic/claude-opus-5` 처럼 제공자를 앞에 붙이므로 슬래시
 * 앞을 먼저 본다. 그 뒤 규칙은 지금 실재하는 접두사뿐이다 — 새 모델 이름을
 * 예측해서 넣지 않는다. 틀린 로고는 없는 로고보다 나쁘다.
 */
const MODEL_PREFIX: [string, BrandKey][] = [
  ["claude", "anthropic"],
  ["gpt", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["o4", "openai"],
  ["codex", "openai"],
  ["gemini", "google"],
  ["gemma", "google"],
];

export function brandForProvider(id: string): BrandKey | null {
  return BY_PROVIDER[id] ?? null;
}

export function brandForSource(source: string | undefined): BrandKey | null {
  if (!source) return null;
  return BY_SOURCE[source.toLowerCase()] ?? null;
}

export function brandForModel(model: string | undefined): BrandKey | null {
  if (!model) return null;
  const raw = model.toLowerCase();
  // `anthropic/claude-opus-5` — 슬래시 앞이 제공자면 그게 답이다.
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const vendor = BY_PROVIDER[raw.slice(0, slash)];
    if (vendor) return vendor;
  }
  const name = slash > 0 ? raw.slice(slash + 1) : raw;
  for (const [prefix, key] of MODEL_PREFIX) {
    if (name.startsWith(prefix)) return key;
  }
  return null;
}

/** 소스 · 모델 순으로 찾는다. 목록 행처럼 둘 다 있는 자리에서 쓴다. */
export function brandForRun(run: { source?: string; model?: string }): BrandKey | null {
  return brandForSource(run.source) ?? brandForModel(run.model);
}
