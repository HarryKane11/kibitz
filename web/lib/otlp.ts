import type { ContextFrame, ObsType, Phase, Run, RunScore, Turn } from "@/lib/types";

type OtlpValue = {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: OtlpValue[] };
};

type OtlpAttribute = { key?: string; value?: OtlpValue };

type OtlpSpan = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtlpAttribute[];
  status?: { code?: number; message?: string };
  events?: { name?: string; attributes?: OtlpAttribute[] }[];
};

type OtlpResourceSpan = {
  resource?: { attributes?: OtlpAttribute[] };
  scopeSpans?: { spans?: OtlpSpan[] }[];
};

export type OtlpExportRequest = { resourceSpans?: OtlpResourceSpan[] };

/**
 * 저장 단위. 스팬 하나와 그것이 실려 온 resource 속성.
 *
 * resource 를 스팬마다 들고 다니는 것은 중복이지만, 배치가 따로 도착하므로
 * 그 배치의 resource 를 함께 적어 두지 않으면 나중에 복원할 수 없다.
 */
export type SpanRecord = { span: OtlpSpan; resource: Record<string, unknown> };

function anyValue(value?: OtlpValue): unknown {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(anyValue);
  return undefined;
}

function attrs(list: OtlpAttribute[] = []): Record<string, unknown> {
  return Object.fromEntries(
    list.flatMap((item) => (item.key ? [[item.key, anyValue(item.value)]] : [])),
  );
}

function nano(raw?: string): bigint {
  try {
    return BigInt(raw ?? "0");
  } catch {
    return 0n;
  }
}

function durationMs(span: OtlpSpan): number {
  const duration = nano(span.endTimeUnixNano) - nano(span.startTimeUnixNano);
  return duration > 0n ? Number(duration / 1_000_000n) : 0;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 여러 규약을 우선순위대로 훑는다.
 *
 * Langfuse 문서가 정한 순서를 그대로 쓴다: `langfuse.*` 가 가장 세고, 그다음
 * OpenInference(Phoenix), 그다음 OTel GenAI, 마지막이 예전 `llm.*`. 한 필드를
 * 한 규약에서만 읽으면 그 계측기를 쓰는 사람만 값을 보고 나머지는 빈칸을 본다.
 */
function pick(values: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = values[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function num(values: Record<string, unknown>, keys: string[]): number {
  const v = pick(values, keys);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * OpenInference 의 `openinference.span.kind` → 우리 ObsType.
 *
 * Phoenix 계측기(openinference-instrumentation-*)가 붙이는 값이다. 이게 있으면
 * 이름으로 추측하지 않는다 — 계측기가 이미 답을 알고 있는데 정규식으로 다시
 * 맞히려 들면 그쪽이 틀린다.
 */
const OPENINFERENCE_KIND: Record<string, ObsType> = {
  LLM: "llm",
  EMBEDDING: "llm",
  CHAIN: "chain",
  RETRIEVER: "retriever",
  RERANKER: "retriever",
  TOOL: "tool",
  AGENT: "agent",
  GUARDRAIL: "tool",
  EVALUATOR: "tool",
  PROMPT: "chain",
};

function phaseOf(name: string, values: Record<string, unknown>): Phase {
  const phase = values["kibitz.phase"];
  if (phase === "plan" || phase === "gather" || phase === "reason" || phase === "deliver") {
    return phase;
  }
  const lower = name.toLowerCase();
  if (/search|retriev|read|fetch|query/.test(lower)) return "gather";
  if (/answer|respond|complete|deliver/.test(lower)) return "deliver";
  if (/plan|route|classif/.test(lower)) return "plan";
  return "reason";
}

function obsTypeOf(span: OtlpSpan, values: Record<string, unknown>, root: boolean): ObsType {
  const declared = text(
    pick(values, ["openinference.span.kind", "langfuse.observation.type"]),
  ).toUpperCase();
  if (OPENINFERENCE_KIND[declared]) return OPENINFERENCE_KIND[declared];
  if (root) return "chain";
  if (pick(values, ["gen_ai.system", "gen_ai.request.model", "llm.model_name", "llm.system"])) {
    return "llm";
  }
  const lower = (span.name ?? "").toLowerCase();
  if (/search|retriev|read|fetch|query/.test(lower)) return "retriever";
  if (/agent|delegate|handoff/.test(lower)) return "agent";
  return span.events?.length && span.kind === 1 ? "event" : "tool";
}

function scoreOf(turns: Turn[]): RunScore {
  const errors = turns.filter((turn) => turn.verdict === "error").length;
  const scored = turns.filter((turn) => turn.obsType !== "chain");
  return {
    accuracy: scored.length ? Math.round(((scored.length - errors) / scored.length) * 100) : 100,
    errors,
    wastes: 0,
    wastedTokenPct: 0,
    phases: (["plan", "gather", "reason", "deliver"] as Phase[]).map((phase) => {
      const group = scored.filter((turn) => turn.phase === phase);
      const ok = group.filter((turn) => turn.verdict === "good").length;
      return { phase, accuracy: group.length ? Math.round((ok / group.length) * 100) : 100 };
    }),
  };
}

/**
 * 배치를 traceId 별 스팬 목록으로 평탄화한다.
 *
 * `otlpToRuns` 가 하던 일의 앞쪽 절반이다. 나눈 이유: 살아 있는 런은 배치가 여러 번
 * 도착하고, 그때마다 **그 배치만으로** Run 을 만들면 앞의 배치가 지워진다.
 * 평탄화한 스팬을 먼저 저장하고, 저장된 전체로 Run 을 다시 만든다.
 */
export function flattenOtlp(request: OtlpExportRequest): Map<string, SpanRecord[]> {
  const grouped = new Map<string, SpanRecord[]>();
  for (const resourceSpan of request.resourceSpans ?? []) {
    const resource = attrs(resourceSpan.resource?.attributes);
    for (const scope of resourceSpan.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        if (!span.traceId || !span.spanId) continue;
        grouped.set(span.traceId, [...(grouped.get(span.traceId) ?? []), { span, resource }]);
      }
    }
  }
  return grouped;
}

/**
 * 스팬 전체로 Run 하나를 만든다. **누적된 스팬을 넘겨야 한다** — 한 배치만 넘기면
 * 그 배치만 담긴 Run 이 나오고, 그게 정확히 우리가 고친 버그다.
 */
export function runFromSpans(
  traceId: string,
  entries: SpanRecord[],
  projectOverride?: string,
): Run | null {
  if (entries.length === 0) return null;
  return buildRun(traceId, entries, projectOverride);
}

/** 완료된 트레이스를 한 번에 받을 때의 편의 함수. 내부는 위 둘과 같다. */
export function otlpToRuns(request: OtlpExportRequest, projectOverride?: string): Run[] {
  return [...flattenOtlp(request).entries()]
    .map(([traceId, entries]) => runFromSpans(traceId, entries, projectOverride))
    .filter((run): run is Run => run !== null);
}

function buildRun(
  traceId: string,
  entries: SpanRecord[],
  projectOverride?: string,
): Run {
  {
    const ordered = [...entries].sort((a, b) =>
      nano(a.span.startTimeUnixNano) < nano(b.span.startTimeUnixNano) ? -1 : 1,
    );
    const indexBySpan = new Map(ordered.map((entry, index) => [entry.span.spanId!, index]));
    const startedNano = nano(ordered[0].span.startTimeUnixNano);
    const root = ordered.find((entry) => !entry.span.parentSpanId) ?? ordered[0];
    const resource = root.resource;

    const turns: Turn[] = ordered.map(({ span }, index) => {
      const values = attrs(span.attributes);
      const isRoot = !span.parentSpanId || !indexBySpan.has(span.parentSpanId);
      const input = pick(values, [
        "langfuse.observation.input",
        "input.value",           // OpenInference (Phoenix)
        "mlflow.spanInputs",
        "gen_ai.prompt",
        "gen_ai.input.messages",
        "input",
      ]);
      const output =
        pick(values, [
          "langfuse.observation.output",
          "output.value",
          "mlflow.spanOutputs",
          "gen_ai.completion",
          "gen_ai.output.messages",
          "output",
        ]) ?? span.status?.message;
      const inputTokens = num(values, [
        "gen_ai.usage.input_tokens",
        "llm.token_count.prompt",     // OpenInference
        "llm.usage.prompt_tokens",
        "gen_ai.usage.prompt_tokens",
      ]);
      const outputTokens = num(values, [
        "gen_ai.usage.output_tokens",
        "llm.token_count.completion",
        "llm.usage.completion_tokens",
        "gen_ai.usage.completion_tokens",
      ]);
      // 캐시 계층은 OpenInference 만 준다. 있으면 컨텍스트 구성이 실측이 된다.
      const cacheRead = num(values, [
        "llm.token_count.prompt_details.cache_read",
        "gen_ai.usage.cache_read_input_tokens",
      ]);
      const cacheWrite = num(values, [
        "llm.token_count.prompt_details.cache_write",
        "gen_ai.usage.cache_creation_input_tokens",
      ]);
      const context: ContextFrame[] = [
        ...(cacheRead ? [{ label: "cacheRead" as const, tokens: cacheRead }] : []),
        ...(cacheWrite ? [{ label: "cacheWrite" as const, tokens: cacheWrite }] : []),
        { label: "freshInput", tokens: Math.max(0, inputTokens - cacheRead - cacheWrite) },
        { label: "output", tokens: outputTokens },
      ];
      const failed = span.status?.code === 2;
      const startOffset =
        nano(span.startTimeUnixNano) > startedNano
          ? Number((nano(span.startTimeUnixNano) - startedNano) / 1_000_000n)
          : 0;
      const name = span.name || "OTLP span";
      return {
        index,
        phase: phaseOf(name, values),
        kind: isRoot ? "user" : "decision",
        verdict: failed ? "error" : "good",
        obsType: obsTypeOf(span, values, isRoot),
        ...(span.parentSpanId && indexBySpan.has(span.parentSpanId)
          ? { parentIndex: indexBySpan.get(span.parentSpanId) }
          : {}),
        startOffsetMs: startOffset,
        title: name,
        ...(isRoot ? { utterance: text(input) || name } : {}),
        ...(!isRoot ? { call: `${name}()` } : {}),
        durationMs: durationMs(span),
        tokens: inputTokens + outputTokens,
        costUsd: num(values, [
          "langfuse.observation.cost_details.total",
          "gen_ai.usage.cost",
          "llm.usage.cost",
        ]),
        recordsKnown: 0,
        context,
        prompt: text(input),
        output: text(output),
      } satisfies Turn;
    });

    const score = scoreOf(turns);
    const lastEnd = ordered.reduce(
      (max, entry) =>
        nano(entry.span.endTimeUnixNano) > max ? nano(entry.span.endTimeUnixNano) : max,
      startedNano,
    );
    // 루트가 닫혔는가 = 트레이스가 끝났는가. 루트 스팬이 아직 도착하지 않은 경우도
    // "열림"이다 — 자식만 온 상태이므로 진행 중이다.
    const rootClosed = !!root.span.parentSpanId
      ? false
      : nano(root.span.endTimeUnixNano) > 0n;
    const rootAttrs = attrs(root.span.attributes);
    const startedAt = new Date(Number(startedNano / 1_000_000n)).toISOString();
    const tags = rootAttrs["kibitz.tags"];
    return {
      id: `ot_${traceId}`,
      project:
        projectOverride ||
        text(rootAttrs["kibitz.project"]) ||
        text(resource["service.namespace"]) ||
        "default",
      agent: text(resource["service.name"]) || text(rootAttrs["gen_ai.agent.name"]) || "otel-agent",
      source: "opentelemetry",
      sessionId:
        text(pick(rootAttrs, ["langfuse.session.id", "session.id", "gen_ai.conversation.id"])) ||
        undefined,
      userId: text(pick(rootAttrs, ["langfuse.user.id", "user.id"])) || undefined,
      tags: Array.isArray(tags) ? tags.map(String) : tags ? [text(tags)] : [],
      release: text(resource["service.version"]) || undefined,
      environment:
        text(
          pick(resource, ["deployment.environment.name", "deployment.environment"]),
        ) || undefined,
      title: text(pick(rootAttrs, ["langfuse.trace.name"])) || root.span.name || "OpenTelemetry trace",
      titleTail: "",
      model:
        text(
          pick(rootAttrs, [
            "gen_ai.request.model",
            "llm.model_name",
            "gen_ai.response.model",
          ]),
        ) ||
        // 모델은 루트가 아니라 LLM 스팬에 붙는 경우가 대부분이다.
        text(
          ordered
            .map((e) => attrs(e.span.attributes))
            .map((v) => pick(v, ["gen_ai.request.model", "llm.model_name", "gen_ai.response.model"]))
            .find(Boolean),
        ) ||
        "unknown",
      startedAt,
      durationMs: Number((lastEnd - startedNano) / 1_000_000n),
      totalTokens: turns.reduce((sum, turn) => sum + turn.tokens, 0),
      costUsd: Number(turns.reduce((sum, turn) => sum + turn.costUsd, 0).toFixed(6)),
      costEstimated: false,
      humanInterventions: 0,
      registeredTools: 0,
      usedTools: new Set(
        turns.filter((turn) => turn.call).map((turn) => turn.call!.split("(")[0]),
      ).size,
      unusedToolTokens: 0,
      status: score.errors ? "failed" : "ok",
      score,
      turns,
      // ── 실시간: 이 런이 아직 돌고 있는가 ──────────────────────
      // 루트 스팬이 닫히지 않았으면 열려 있다. OTel 은 스팬이 끝날 때 내보내므로
      // 루트가 도착했다는 것 자체가 대개 완료를 뜻하지만, `BatchSpanProcessor` 는
      // 자식부터 내보내므로 진행 중에는 루트가 아직 없다.
      open: !rootClosed,
      updatedAt: new Date(Number(lastEnd / 1_000_000n)).toISOString(),
      spanCount: entries.length,
    } satisfies Run;
  }
}
