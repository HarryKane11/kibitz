import type { Brief } from "@/lib/analysis/brief";

/**
 * 제안 — 모델이 하는 유일한 일.
 *
 * 판정은 이미 있다. 모델에게 "이 런 괜찮았어?"를 묻지 않는다 — 그건 검증 못 하는
 * 대답이고, 이 제품이 하지 않기로 한 것이다. 묻는 것은 하나뿐이다:
 * **계산된 판정들을 놓고, 무엇을 바꾸면 다시 안 생기나.**
 *
 * 그리고 그 대답도 검증한다. 제안마다 어떤 관측을 근거로 삼았는지 적게 하고,
 * 그 번호가 실제로 판정이 붙은 관측인지 대조한다 — `unsourced-number` 규칙이
 * 출력의 숫자를 도구 출력과 대조하는 것과 같은 검사를, 모델의 제안에 적용한다.
 */

/** 이 검사도 화면에 그대로 노출한다. 규칙이 보이지 않으면 근거가 아니다. */
export const CITATION_RULE = "cited observation ∈ observations with a verdict";

export interface Suggestion {
  title: string;
  why: string;
  change: string;
  /** 이 제안이 근거로 든 관측 번호 */
  observations: number[];
  kinds: string[];
  /** 브리프에 없는 번호 — 모델이 지어낸 것이다 */
  ungrounded: number[];
}

export interface Suggestions {
  summary: string;
  items: Suggestion[];
}

export const SUGGESTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One or two sentences: what this trace's failures have in common.",
    },
    suggestions: {
      type: "array",
      description: "Concrete changes, most valuable first. Three to six.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Imperative, under 60 characters." },
          why: {
            type: "string",
            description: "Which cited evidence makes this the fix. No new numbers.",
          },
          change: {
            type: "string",
            description:
              "The concrete edit: prompt text, tool definition, harness behavior, or cache placement.",
          },
          observations: {
            type: "array",
            description: "Observation indices from the brief that this addresses.",
            items: { type: "integer" },
          },
          kinds: {
            type: "array",
            description: "Verdict kinds from the brief that this addresses.",
            items: { type: "string" },
          },
        },
        required: ["title", "why", "change", "observations", "kinds"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "suggestions"],
  additionalProperties: false,
};

export function systemPrompt(locale: string): string {
  const language =
    locale === "ko"
      ? "Write summary, title, why, and change in Korean. Keep identifiers, tool names, and code in English."
      : "Write in English.";

  return [
    "You are helping a developer improve an agent harness — its system prompt, tool set, and loop.",
    "",
    "The findings you are given were computed by six deterministic rules over the recorded trace:",
    "argument comparison, subsequence detection, empty-result matching, message-set comparison, cache comparison, and source matching.",
    "No model judged them. Treat them as evidence-backed signals and focus on whether each signal",
    "supports a concrete change. Do not grade the run.",
    "",
    "Your only job: given these measurements, say what to change so they stop happening.",
    "",
    "Rules for your output:",
    "- Every suggestion must cite the observation indices it addresses. Use only indices present in the brief.",
    "- Never invent an index, a token count, a duration, or a cost. The brief already carries the measured savings.",
    "- Be specific to this trace. A suggestion that would apply to any agent is worse than no suggestion.",
    "- Name the change concretely: the prompt sentence to add, the tool to drop, the guard to insert.",
    "- If the evidence does not support a change, return fewer suggestions. Padding is a failure.",
    "- Output JSON only, matching the schema. No prose outside the JSON.",
    language,
  ].join("\n");
}

export function userPrompt(briefBody: string): string {
  return [
    briefBody,
    "",
    "---",
    "Given the verdicts above, what should change in this agent's prompt, tools, or loop?",
  ].join("\n");
}

/**
 * 응답을 제안으로. 스키마를 강제하지 못한 제공자를 위해 관대하게 파싱한다 —
 * 코드펜스, 앞뒤 인사말, 후행 텍스트를 모두 감안한다.
 */
export function parseSuggestions(raw: string, brief: Brief): Suggestions {
  const json = extractJson(raw);
  if (json === null) {
    throw new Error("the model did not return JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("the model returned JSON that could not be parsed");
  }

  const obj = parsed as { summary?: unknown; suggestions?: unknown };
  const list = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const known = new Set(brief.verdicts.map((v) => v.observation));

  const items: Suggestion[] = list
    .map((entry) => {
      const s = entry as Record<string, unknown>;
      const observations = numbers(s.observations);
      return {
        title: text(s.title),
        why: text(s.why),
        change: text(s.change),
        observations,
        kinds: strings(s.kinds),
        // 근거 대조. 모델이 없는 관측을 인용했으면 그 사실을 화면에 남긴다.
        ungrounded: observations.filter((n) => !known.has(n)),
      };
    })
    .filter((s) => s.title || s.change);

  if (items.length === 0) {
    throw new Error("the model response contained no suggestions");
  }

  return { summary: text(obj.summary), items };
}

/** 첫 `{` 부터 마지막 `}` 까지. 코드펜스와 잡담을 견딘다. */
function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function numbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((n) => Number(n)).filter((n) => Number.isInteger(n));
}

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => (typeof s === "string" ? s : "")).filter(Boolean);
}
