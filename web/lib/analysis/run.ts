import "server-only";
import { getRun } from "@/lib/data";
import { getLocale } from "@/lib/i18n";
import { acceptsPastedKeys } from "@/lib/deploy";
import { loadAnalyses, saveAnalysis } from "@/lib/analysis/store";
import { briefText, buildBrief } from "@/lib/analysis/brief";
import {
  PROVIDERS,
  providerSpec,
  type AnalyzeInput,
  type AnalyzeOutcome,
  type ProviderId,
  type ProviderStatus,
} from "@/lib/analysis/catalog";
import {
  callProvider,
  envKeyFor,
  ollamaBase,
  ollamaModels,
  ProviderError,
} from "@/lib/analysis/providers";
import {
  cliAgentStatus,
  localCodeAgentsEnabled,
  loginCommand,
  type CliAgentProvider,
} from "@/lib/analysis/cli-agents";
import {
  CITATION_RULE,
  parseSuggestions,
  SUGGESTION_SCHEMA,
  systemPrompt,
  userPrompt,
} from "@/lib/analysis/suggest";

/**
 * 분석 실행 — 서버 액션과 HTTP 라우트가 공유하는 한 벌.
 *
 * 입구가 둘인 이유: 화면은 서버 액션으로 부른다 (같은 출처, CSRF 검사, 읽기 토큰이
 * 걸려 있어도 동작한다). 스크립트와 MCP 는 `POST /api/analyze` 로 부른다. 실행 로직이
 * 두 벌이면 한쪽만 고쳐지므로 여기 하나만 둔다.
 */

/** 브리프 미리보기 — 모델을 부르지 않는다. 보내기 전에 무엇이 나가는지 읽을 수 있게. */
export async function briefPreview(
  runId: string,
): Promise<{ full: string; redacted: string; verdicts: number } | null> {
  const run = await getRun(runId);
  if (!run) return null;
  const full = buildBrief(run, { redactArgs: false });
  return {
    full: briefText(full),
    redacted: briefText(buildBrief(run, { redactArgs: true })),
    verdicts: full.verdicts.length,
  };
}

/**
 * 제공자 상태.
 *
 * `probeOllama` 를 켜면 로컬 ollama 에 모델 목록을 물어본다. 페이지 렌더에서는 끈다 —
 * 떠 있지 않은 ollama 를 기다리느라 트레이스 화면이 늦어지면 안 된다.
 */
export async function providerStatuses(probeOllama = false): Promise<ProviderStatus[]> {
  return Promise.all(
    PROVIDERS.map(async (p): Promise<ProviderStatus> => {
      const base: ProviderStatus = {
        id: p.id,
        label: p.label,
        authMode: p.authMode,
        needsKey: p.needsKey,
        requiresModel: p.requiresModel,
        configured: !p.needsKey || envKeyFor(p.id) !== undefined,
        defaultModel: p.defaultModel,
        modelsHint: p.modelsHint,
        // 공개 배포에서는 붙여 넣기가 막혀 있다. 화면이 이걸 알아야 입력란을
        // 띄워 놓고 실패시키지 않는다.
        keysBlocked:
          p.authMode === "api-key" && !acceptsPastedKeys() && envKeyFor(p.id) === undefined
            ? true
            : undefined,
      };
      if (p.authMode === "cli-session") {
        const provider = p.id as CliAgentProvider;
        if (!localCodeAgentsEnabled()) {
          return {
            ...base,
            configured: false,
            loginCommand: loginCommand(provider),
            loginAvailable: false,
            unavailable:
              "disabled on this server — set KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1",
          };
        }
        const status = await cliAgentStatus(provider);
        return {
          ...base,
          configured: status.loggedIn,
          loginCommand: loginCommand(provider),
          loginAvailable: status.installed,
          unavailable: !status.installed
            ? "CLI not installed on the Kibitz server"
            : status.loggedIn
              ? undefined
              : "login required",
        };
      }
      if (p.id !== "ollama") return base;
      // 물어보지 않았으면 모른다. 키가 필요 없다는 사실만으로 "쓸 수 있다"고
      // 표시하면 떠 있지 않은 ollama 가 준비된 것처럼 보인다.
      if (!probeOllama) return { ...base, configured: false };

      // ollama 는 로컬이라 "설정됨"이 곧 "떠 있음"이다. 목록을 물으면 둘을 한 번에 안다.
      try {
        const models = await ollamaModels();
        return {
          ...base,
          models,
          defaultModel: models[0] ?? "",
          configured: models.length > 0,
          unavailable: models.length === 0 ? "no models pulled — run `ollama pull`" : undefined,
        };
      } catch {
        return {
          ...base,
          models: [],
          configured: false,
          unavailable: `not reachable at ${ollamaBase()}`,
        };
      }
    }),
  );
}

/** 이 트레이스에 저장된 분석. 화면이 새로고침 후에도 그대로 보여 준다. */
export async function savedAnalyses(runId: string) {
  return loadAnalyses(runId);
}

export async function runAnalysis(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const spec = providerSpec(input.provider);
  if (!spec) {
    return fail(
      `unknown provider — expected one of ${PROVIDERS.map((p) => p.id).join(", ")}`,
      400,
    );
  }

  const run = input.runId ? await getRun(input.runId) : undefined;
  if (!run) return fail("run not found", 404);

  const model = (input.model || spec.defaultModel).trim();
  if (spec.requiresModel && !model) return fail(`${spec.label}: pick a model`, 400);

  // 서버 키가 있으면 그걸 쓴다 — 브라우저가 키를 들고 다닐 이유가 없다.
  // 공개 배포에서는 붙여 넣은 키를 아예 받지 않는다: 낯선 웹페이지에 API 키를 넣는
  // 습관을 우리가 만들어 주면 안 되고, 그 사이트가 털리면 그 키도 함께 털린다.
  const serverKey = envKeyFor(spec.id);
  const pasted = acceptsPastedKeys() ? input.apiKey?.trim() : undefined;
  const apiKey = serverKey ?? pasted;
  if (spec.needsKey && !apiKey) {
    return fail(
      acceptsPastedKeys()
        ? `${spec.label}: needs an API key (${spec.envKey} on the server, or paste one)`
        : `${spec.label}: this is the public demo — it does not take pasted keys. Self-host Kibitz to analyze with your own key.`,
      400,
    );
  }

  const brief = buildBrief(run, { redactArgs: input.redactArgs === true });
  if (brief.verdicts.length === 0 && brief.hotCalls.length === 0) {
    return fail("nothing to analyze — no verdicts and no repeated calls in this trace", 422);
  }

  const sent = briefText(brief);
  const locale = await getLocale();

  let result;
  try {
    result = await callProvider({
      provider: spec.id as ProviderId,
      model,
      apiKey,
      baseUrl: input.baseUrl,
      system: systemPrompt(locale),
      user: userPrompt(sent),
      schema: SUGGESTION_SCHEMA,
    });
  } catch (err) {
    if (err instanceof ProviderError) return fail(err.message, err.status);
    // 예상 못 한 예외는 메시지만 꺼낸다 — 스택에 요청 헤더가 실릴 수 있다.
    return fail(err instanceof Error ? err.message.slice(0, 300) : "provider call failed", 502);
  }

  try {
    const suggestions = parseSuggestions(result.text, brief);
    const outcome: AnalyzeOutcome = {
      ok: true,
      provider: spec.id,
      model: result.model,
      usage: result.usage,
      schemaEnforced: result.schemaEnforced,
      citationRule: CITATION_RULE,
      summary: suggestions.summary,
      suggestions: suggestions.items,
      brief: { chars: sent.length, verdicts: brief.verdicts.length, redacted: brief.redacted },
    };
    // 저장한다. 새로고침 한 번에 사용자가 돈과 시간을 들여 만든 것이 사라지면
    // 그건 원칙이 아니라 버그다 (lib/analysis/store.ts 주석 참고).
    if (outcome.ok) saveAnalysis(run.id, outcome, new Date().toISOString());
    return outcome;
  } catch (err) {
    return {
      ok: false,
      status: 422,
      error: err instanceof Error ? err.message : "could not read the model response",
      // 스키마를 강제하지 못하는 제공자에서 생긴다. 원문 앞부분이 있으면
      // 사용자가 모델을 바꿀지 판단할 수 있다.
      raw: result.text.slice(0, 600),
    };
  }
}

function fail(error: string, status: number): AnalyzeOutcome {
  return { ok: false, error, status };
}
