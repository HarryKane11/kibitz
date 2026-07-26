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
  if (root) return "chain";
  if (values["gen_ai.system"] || values["gen_ai.request.model"]) return "llm";
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

/** OTLP/HTTP JSON ExportTraceServiceRequest를 Kibitz Run으로 변환한다. */
export function otlpToRuns(request: OtlpExportRequest, projectOverride?: string): Run[] {
  const grouped = new Map<
    string,
    { span: OtlpSpan; resource: Record<string, unknown> }[]
  >();

  for (const resourceSpan of request.resourceSpans ?? []) {
    const resource = attrs(resourceSpan.resource?.attributes);
    for (const scope of resourceSpan.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        if (!span.traceId || !span.spanId) continue;
        grouped.set(span.traceId, [
          ...(grouped.get(span.traceId) ?? []),
          { span, resource },
        ]);
      }
    }
  }

  return [...grouped.entries()].map(([traceId, entries]) => {
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
      const input =
        values["gen_ai.prompt"] ??
        values["gen_ai.input.messages"] ??
        values["input.value"] ??
        values["input"];
      const output =
        values["gen_ai.completion"] ??
        values["gen_ai.output.messages"] ??
        values["output.value"] ??
        values["output"] ??
        span.status?.message;
      const inputTokens = Number(
        values["gen_ai.usage.input_tokens"] ?? values["llm.usage.prompt_tokens"] ?? 0,
      );
      const outputTokens = Number(
        values["gen_ai.usage.output_tokens"] ?? values["llm.usage.completion_tokens"] ?? 0,
      );
      const context: ContextFrame[] = [
        { label: "freshInput", tokens: inputTokens },
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
        costUsd: Number(values["gen_ai.usage.cost"] ?? values["llm.usage.cost"] ?? 0),
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
      sessionId: text(rootAttrs["session.id"]) || undefined,
      userId: text(rootAttrs["user.id"]) || undefined,
      tags: Array.isArray(tags) ? tags.map(String) : tags ? [text(tags)] : [],
      release: text(resource["service.version"]) || undefined,
      environment: text(resource["deployment.environment.name"]) || undefined,
      title: root.span.name || "OpenTelemetry trace",
      titleTail: "",
      model: text(rootAttrs["gen_ai.request.model"]) || "unknown",
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
    } satisfies Run;
  });
}
