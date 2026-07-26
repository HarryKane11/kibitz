import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface KibitzClientOptions {
  url?: string;
  token?: string;
  project?: string;
  fetch?: typeof globalThis.fetch;
}

export interface TraceOptions {
  agent?: string;
  project?: string;
  model?: string;
  sessionId?: string;
  userId?: string;
  tags?: string[];
  client?: KibitzClient;
}

export interface SpanOptions {
  input?: unknown;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  type?: "llm" | "retriever" | "tool" | "agent" | "event";
}

interface Turn {
  index: number;
  phase: "plan" | "gather" | "reason" | "deliver";
  kind: "user" | "decision" | "answer";
  verdict: "good" | "error";
  obsType: "chain" | "llm" | "retriever" | "tool" | "agent" | "event";
  parentIndex?: number;
  startOffsetMs: number;
  title: string;
  utterance?: string;
  call?: string;
  durationMs: number;
  tokens: number;
  costUsd: number;
  recordsKnown: number;
  context: { label: "freshInput" | "output"; tokens: number }[];
  prompt?: string;
  output: string;
}

const active = new AsyncLocalStorage<TraceRun>();

function display(value: unknown, max = 4000): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function phase(name: string): Turn["phase"] {
  const lower = name.toLowerCase();
  if (/search|read|retriev|fetch|query/.test(lower)) return "gather";
  if (/answer|respond|deliver/.test(lower)) return "deliver";
  if (/plan|route|classif/.test(lower)) return "plan";
  return "reason";
}

export class KibitzClient {
  readonly url: string;
  readonly token?: string;
  readonly project?: string;
  readonly fetcher: typeof globalThis.fetch;

  constructor(options: KibitzClientOptions = {}) {
    this.url = (options.url ?? process.env.KIBITZ_URL ?? "http://localhost:3000").replace(/\/$/, "");
    this.token = options.token ?? process.env.KIBITZ_INGEST_TOKEN;
    this.project = options.project;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async send(run: unknown): Promise<void> {
    const response = await this.fetcher(`${this.url}/api/traces`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(this.project ? { "x-kibitz-project": this.project } : {}),
      },
      body: JSON.stringify(run),
    });
    if (!response.ok) {
      throw new Error(`Kibitz ingestion failed: HTTP ${response.status}`);
    }
  }
}

export class TraceRun {
  readonly id = `ts_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  readonly startedAt = new Date();
  readonly turns: Turn[] = [];
  private requestIndex?: number;

  constructor(
    readonly title: string,
    readonly options: TraceOptions,
  ) {}

  async request<T>(text: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.requestIndex;
    this.requestIndex = this.turns.length;
    this.turns.push({
      index: this.turns.length,
      phase: "plan",
      kind: "user",
      verdict: "good",
      obsType: "chain",
      startOffsetMs: Date.now() - this.startedAt.getTime(),
      title: text,
      utterance: text,
      durationMs: 0,
      tokens: 0,
      costUsd: 0,
      recordsKnown: 0,
      context: [],
      output: text,
    });
    try {
      return await fn();
    } finally {
      this.requestIndex = previous;
    }
  }

  async span<T>(
    name: string,
    options: SpanOptions,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const started = performance.now();
    const offset = Date.now() - this.startedAt.getTime();
    try {
      const result = await fn();
      this.closeSpan(name, options, display(result), false, started, offset);
      return result;
    } catch (error) {
      this.closeSpan(name, options, display(error), true, started, offset);
      throw error;
    }
  }

  answer(text: string, options: Omit<SpanOptions, "type"> = {}): void {
    const inputTokens = options.inputTokens ?? 0;
    const outputTokens = options.outputTokens ?? 0;
    this.turns.push({
      index: this.turns.length,
      phase: "deliver",
      kind: "answer",
      verdict: "good",
      obsType: "llm",
      parentIndex: this.requestIndex,
      startOffsetMs: Date.now() - this.startedAt.getTime(),
      title: text.slice(0, 100),
      durationMs: 0,
      tokens: inputTokens + outputTokens,
      costUsd: options.costUsd ?? 0,
      recordsKnown: 0,
      context: [
        { label: "freshInput", tokens: inputTokens },
        { label: "output", tokens: outputTokens },
      ],
      output: text,
    });
  }

  toJSON() {
    const errors = this.turns.filter((turn) => turn.verdict === "error").length;
    const scored = this.turns.filter((turn) => turn.obsType !== "chain");
    const accuracy = scored.length
      ? Math.round(((scored.length - errors) / scored.length) * 100)
      : 100;
    return {
      id: this.id,
      project: this.options.project ?? "typescript",
      agent: this.options.agent ?? "agent",
      source: "typescript-sdk",
      sessionId: this.options.sessionId,
      userId: this.options.userId,
      tags: this.options.tags ?? [],
      title: this.title,
      titleTail: "",
      model: this.options.model ?? "unknown",
      startedAt: this.startedAt.toISOString(),
      durationMs: Date.now() - this.startedAt.getTime(),
      totalTokens: this.turns.reduce((sum, turn) => sum + turn.tokens, 0),
      costUsd: Number(this.turns.reduce((sum, turn) => sum + turn.costUsd, 0).toFixed(6)),
      costEstimated: false,
      humanInterventions: 0,
      status: errors ? "failed" : "ok",
      score: {
        accuracy,
        errors,
        wastes: 0,
        wastedTokenPct: 0,
        phases: (["plan", "gather", "reason", "deliver"] as const).map((name) => {
          const group = scored.filter((turn) => turn.phase === name);
          const ok = group.filter((turn) => turn.verdict === "good").length;
          return { phase: name, accuracy: group.length ? Math.round((ok / group.length) * 100) : 100 };
        }),
      },
      turns: this.turns,
    };
  }

  private closeSpan(
    name: string,
    options: SpanOptions,
    output: string,
    failed: boolean,
    started: number,
    offset: number,
  ): void {
    const inputTokens = options.inputTokens ?? 0;
    const outputTokens = options.outputTokens ?? 0;
    this.turns.push({
      index: this.turns.length,
      phase: phase(name),
      kind: "decision",
      verdict: failed ? "error" : "good",
      obsType: options.type ?? "tool",
      parentIndex: this.requestIndex,
      startOffsetMs: offset,
      title: name,
      call: `${name}(${display(options.input, 500)})`,
      durationMs: Math.round(performance.now() - started),
      tokens: inputTokens + outputTokens,
      costUsd: options.costUsd ?? 0,
      recordsKnown: 0,
      context: [
        { label: "freshInput", tokens: inputTokens },
        { label: "output", tokens: outputTokens },
      ],
      prompt: display(options.input),
      output,
    });
  }
}

export async function trace<T>(
  title: string,
  options: TraceOptions,
  fn: (run: TraceRun) => Promise<T> | T,
): Promise<T> {
  const run = new TraceRun(title, options);
  const client = options.client ?? new KibitzClient({ project: options.project });
  try {
    return await active.run(run, () => fn(run));
  } finally {
    await client.send(run.toJSON());
  }
}

export function instrument<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  options: Omit<SpanOptions, "input"> = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const run = active.getStore();
    if (!run) return fn(...args);
    return run.span(name, { ...options, input: args }, () => fn(...args));
  };
}
