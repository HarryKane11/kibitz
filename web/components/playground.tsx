"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Info, RotateCcw } from "lucide-react";
import type { Run, Turn } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { Card } from "@/components/page";
import { cn } from "@/lib/utils";

type Lang = "python" | "typescript" | "curl";

/**
 * 플레이그라운드.
 *
 * LangSmith 는 어떤 run 이든 playground 로 열어 프롬프트를 고쳐 다시 돌린다.
 * 우리는 **부르지는 않는다** — 키를 들고 있지 않고, 들고 있는 척하지도 않는다.
 * 대신 기록된 호출을 그대로 편집 가능하게 두고, 그 상태로 돌릴 수 있는 스니펫을 만든다.
 * 화면에서 사라지는 것은 실행뿐이고 디버깅 루프(보고 → 고치고 → 돌린다)는 남는다.
 */
export function Playground({ run, turn }: { run: Run; turn: Turn }) {
  const t = useT();

  const recorded = turn.prompt ?? turn.utterance ?? turn.call ?? "";
  const [prompt, setPrompt] = useState(recorded);
  const [model, setModel] = useState(run.model);
  const [temperature, setTemperature] = useState(1);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [lang, setLang] = useState<Lang>("python");
  const [copied, setCopied] = useState(false);

  const edited = prompt !== recorded;

  const snippet = useMemo(
    () => buildSnippet(lang, { model, prompt, temperature, maxTokens }),
    [lang, model, prompt, temperature, maxTokens],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              {t("playground.request")}
            </h2>
            <div className="flex items-center gap-2">
              {edited && (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-warn">
                  {t("playground.edited")}
                </span>
              )}
              <button
                onClick={() => setPrompt(recorded)}
                disabled={!edited}
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors duration-100",
                  edited
                    ? "text-fg-2 hover:text-fg active:scale-[0.97]"
                    : "cursor-not-allowed text-fg-3/50",
                )}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                {t("playground.reset")}
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="pg-prompt">
            {t("playground.request")}
          </label>
          <textarea
            id="pg-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            spellCheck={false}
            rows={10}
            className="w-full resize-y rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-xs leading-relaxed text-fg outline-none focus:border-line-3"
          />
        </Card>

        <Card>
          <h2 className="mb-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
            {t("playground.recorded")}
          </h2>
          <pre className="max-h-64 overflow-auto rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">
            {turn.output}
          </pre>
        </Card>

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              {t("playground.snippet")}
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-line p-0.5">
                {(["python", "typescript", "curl"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    aria-pressed={lang === l}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-mono text-[11px] transition-colors duration-100",
                      lang === l
                        ? "bg-fg text-ink-900"
                        : "text-fg-3 hover:text-fg-2 active:scale-[0.97]",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg active:scale-[0.97]"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-fg" aria-hidden />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden />
                )}
                {copied ? t("common.copied") : t("playground.copySnippet")}
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-xs leading-relaxed text-fg-2">
            {snippet}
          </pre>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
            {t("playground.params")}
          </h2>
          <div className="flex flex-col gap-3">
            <Field label={t("playground.model")}>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                spellCheck={false}
                className="w-full rounded-sm border border-line bg-transparent px-2 py-1 font-mono text-xs text-fg outline-none focus:border-line-3"
              />
            </Field>
            <Field label={`${t("playground.temperature")} · ${temperature.toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-[color:var(--color-sky)]"
              />
            </Field>
            <Field label={t("playground.maxTokens")}>
              <input
                type="number"
                min={1}
                max={64000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 1)}
                className="w-full rounded-sm border border-line bg-transparent px-2 py-1 font-mono text-xs text-fg outline-none focus:border-line-3"
              />
            </Field>
          </div>
        </Card>

        {/* 실행이 없다는 사실을 숨기지 않는다. 회색 버튼보다 이유가 낫다. */}
        <div className="rounded-lg border border-line bg-ink-800 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-3.5 w-3.5 shrink-0 text-fg-2" aria-hidden />
            {t("playground.noKeyTitle")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            {t("playground.noKeyBody")}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-fg-3">{label}</span>
      {children}
    </label>
  );
}

/* ── 스니펫 생성 ────────────────────────────────────────────── */

interface SnippetArgs {
  model: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

/** JSON 문자열로 안전하게 넣는다 — 따옴표·개행이 든 프롬프트가 코드를 깨면 안 된다. */
const q = (s: string) => JSON.stringify(s);

function buildSnippet(lang: Lang, a: SnippetArgs): string {
  if (lang === "python") {
    return `import anthropic

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY

message = client.messages.create(
    model=${q(a.model)},
    max_tokens=${a.maxTokens},
    temperature=${a.temperature},
    messages=[{"role": "user", "content": ${q(a.prompt)}}],
)
print(message.content[0].text)`;
  }
  if (lang === "typescript") {
    return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY

const message = await client.messages.create({
  model: ${q(a.model)},
  max_tokens: ${a.maxTokens},
  temperature: ${a.temperature},
  messages: [{ role: "user", content: ${q(a.prompt)} }],
});
console.log(message.content[0]);`;
  }
  return `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '${JSON.stringify({
    model: a.model,
    max_tokens: a.maxTokens,
    temperature: a.temperature,
    messages: [{ role: "user", content: a.prompt }],
  })}'`;
}
