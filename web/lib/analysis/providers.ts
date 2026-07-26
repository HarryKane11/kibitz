import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { providerSpec, type ProviderId } from "@/lib/analysis/catalog";
import { callCliAgent } from "@/lib/analysis/cli-agents";
import {
  ProviderError,
  type CallOpts,
  type CallResult,
} from "@/lib/analysis/provider-contract";

export { ProviderError } from "@/lib/analysis/provider-contract";

/**
 * 제공자 호출.
 *
 * Anthropic 은 공식 SDK(`@anthropic-ai/sdk`), 나머지는 HTTP 다. 섞은 이유는
 * 편의가 아니라 정확성이다 — Anthropic 은 `output_config.format` 으로 스키마를
 * **강제**할 수 있고, SDK 가 그 필드를 타입으로 들고 있다. 다른 제공자는 각자의
 * JSON 모드까지만 켜고 모양은 프롬프트로 요구한 뒤 관대하게 파싱한다.
 *
 * 키는 이 모듈 밖으로 나가지 않는다. 로그하지 않고, 저장하지 않고, 응답에 담지 않는다.
 * 브라우저가 보낸 키는 이 요청 한 번에만 쓰인다.
 */

/**
 * 분석 응답은 짧다 — 판정 목록을 읽고 바꿀 것을 몇 개 적는 일이다.
 * 그래도 Opus 5 는 기본으로 사고하고 `max_tokens` 가 사고+본문을 함께 덮으므로
 * 여유를 둔다. 짧은 상한은 JSON 이 중간에 끊기는 방식으로 실패한다.
 */
const MAX_TOKENS = 16000;
const TIMEOUT_MS = 180_000;

export function ollamaBase(explicit?: string): string {
  return (explicit || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
    /\/+$/,
    "",
  );
}

/** 서버 환경변수의 키. 없으면 undefined — 브라우저가 준 키로 넘어간다. */
export function envKeyFor(id: ProviderId): string | undefined {
  const spec = providerSpec(id);
  const raw = spec?.envKey ? process.env[spec.envKey] : undefined;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/** 로컬에 실제로 내려받힌 ollama 모델. 목록을 우리가 들고 있으면 반드시 틀린다. */
export async function ollamaModels(baseUrl?: string): Promise<string[]> {
  const res = await fetch(`${ollamaBase(baseUrl)}/api/tags`, {
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!res.ok) throw new ProviderError(`ollama: HTTP ${res.status}`);
  const body = (await res.json()) as { models?: { name?: string }[] };
  return (body.models ?? []).map((m) => m.name).filter((n): n is string => !!n);
}

export async function callProvider(o: CallOpts): Promise<CallResult> {
  switch (o.provider) {
    case "claude-code":
    case "codex-cli":
      return callCliAgent(o);
    case "anthropic":
      return callAnthropic(o);
    case "openai":
      return callOpenAICompatible(o, "https://api.openai.com/v1", {
        authorization: `Bearer ${o.apiKey}`,
      });
    case "openrouter":
      return callOpenAICompatible(o, "https://openrouter.ai/api/v1", {
        authorization: `Bearer ${o.apiKey}`,
        "x-title": "Kibitz",
      });
    case "google":
      return callGoogle(o);
    case "ollama":
      return callOllama(o);
  }
}

/* ── Anthropic — 공식 SDK, 스키마 강제 ────────────────────────── */

async function callAnthropic(o: CallOpts): Promise<CallResult> {
  const client = new Anthropic({ apiKey: o.apiKey, maxRetries: 1 });
  try {
    const msg = await client.messages.create(
      {
        model: o.model,
        max_tokens: MAX_TOKENS,
        system: o.system,
        messages: [{ role: "user", content: o.user }],
        // effort=medium: 판정은 이미 계산돼 있고 모델이 할 일은 그것을 읽고
        // 바꿀 것을 적는 일이다. 더 깊이 생각해서 나아지는 종류의 작업이 아니다.
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: o.schema },
        },
      },
      { timeout: TIMEOUT_MS },
    );
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (msg.stop_reason === "refusal") {
      throw new ProviderError("anthropic: request was declined by safety classifiers");
    }
    return {
      text,
      usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
      model: msg.model,
      schemaEnforced: true,
    };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`anthropic: ${cleanMessage(err)}`, statusOf(err));
  }
}

/* ── OpenAI / OpenRouter — chat completions ───────────────────── */

async function callOpenAICompatible(
  o: CallOpts,
  base: string,
  headers: Record<string, string>,
): Promise<CallResult> {
  // max_tokens 를 보내지 않는다. 최신 모델은 `max_completion_tokens` 를 요구하고
  // 어떤 모델은 이름이 다르다 — 제공자 기본값에 맡기는 편이 덜 깨진다.
  const body = {
    model: o.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
    response_format: { type: "json_object" },
  };
  const json = await postJson(`${base}/chat/completions`, headers, body, o.provider);
  const data = json as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: data.usage
      ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 }
      : null,
    model: data.model ?? o.model,
    schemaEnforced: false,
  };
}

/* ── Google — generateContent ─────────────────────────────────── */

async function callGoogle(o: CallOpts): Promise<CallResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(o.model)}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ text: o.user }] }],
    generationConfig: { responseMimeType: "application/json" },
  };
  const json = await postJson(url, { "x-goog-api-key": o.apiKey ?? "" }, body, "google");
  const data = json as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return {
    text,
    usage: data.usageMetadata
      ? {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : null,
    model: o.model,
    schemaEnforced: false,
  };
}

/* ── Ollama — 로컬, 키 없음 ───────────────────────────────────── */

async function callOllama(o: CallOpts): Promise<CallResult> {
  const body = {
    model: o.model,
    stream: false,
    format: "json",
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
  };
  const json = await postJson(
    `${ollamaBase(o.baseUrl)}/api/chat`,
    {},
    body,
    "ollama",
    // 진단 문자열은 영어로 둔다 — 화면이 그대로 보여주고, API 응답으로도 나간다.
    `ollama: not reachable at ${ollamaBase(o.baseUrl)} — is it running? check OLLAMA_BASE_URL`,
  );
  const data = json as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    text: data.message?.content ?? "",
    usage:
      data.prompt_eval_count !== undefined || data.eval_count !== undefined
        ? { input: data.prompt_eval_count ?? 0, output: data.eval_count ?? 0 }
        : null,
    model: o.model,
    schemaEnforced: false,
  };
}

/* ── 공용 HTTP ────────────────────────────────────────────────── */

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  label: string,
  networkHint?: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError(networkHint ?? `${label}: ${cleanMessage(err)}`);
  }

  if (!res.ok) {
    // 제공자 오류 본문은 진단에 필요하다 (모델 이름 오타, 크레딧 소진 등).
    // 앞부분만 쓴다 — 전문을 흘리면 화면이 남의 스택트레이스로 덮인다.
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    throw new ProviderError(
      `${label}: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
      res.status === 401 || res.status === 403 ? 401 : 502,
    );
  }

  try {
    return await res.json();
  } catch {
    throw new ProviderError(`${label}: response was not JSON`);
  }
}

/** 예외 메시지만. 키가 섞일 수 있는 필드는 건드리지 않는다. */
function cleanMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return `timed out after ${TIMEOUT_MS / 1000}s`;
    }
    return err.message.slice(0, 300);
  }
  return "request failed";
}

function statusOf(err: unknown): number {
  const s = (err as { status?: number })?.status;
  return s === 401 || s === 403 ? 401 : 502;
}
