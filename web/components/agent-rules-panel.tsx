"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { AgentRule } from "@/lib/agent-rules";
import { useT } from "@/components/i18n-provider";
import { fmtTokens } from "@/lib/verdict";

/**
 * 규칙을 복사해 가는 자리.
 *
 * 다운로드가 아니라 복사인 이유: 사용자의 `AGENTS.md` 에는 이미 사람이 쓴 규칙이
 * 있다. 파일을 만들어 주면 그걸 덮어쓸 위험이 있고, 조각을 주면 사용자가 어디에
 * 넣을지 고른다. 우리 것이 남의 파일을 이기지 않게 한다.
 *
 * 규칙마다 근거를 접히지 않은 상태로 함께 보여 준다 — 붙여 넣기 전에 "이건 우리
 * 사정상 맞는 동작이다" 하고 뺄 수 있어야 하고, 그 판단에는 숫자가 필요하다.
 */
export function AgentRulesPanel({
  rules,
  markdown,
}: {
  rules: AgentRule[];
  markdown: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  if (rules.length === 0) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    // 되돌아오는 시간은 짧게. 이 버튼은 하루에 여러 번 누르는 것이 아니라
    // 한 번 누르고 파일로 가는 것이므로, 상태가 길게 남을 이유가 없다.
    setTimeout(() => setCopied(false), 1800);
  };

  // 낭비 토큰만 센다 — 스킬 후보의 토큰은 필요했던 일에 쓴 것이다.
  const wasted = rules
    .filter((r) => r.kind !== "skill")
    .reduce((a, r) => a + r.tokens, 0);

  return (
    <section className="mt-10 border-t border-hair pt-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold tracking-tight">{t("rules.title")}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{t("rules.body")}</p>
        </div>
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg active:scale-[0.97]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? t("rules.copied") : t("rules.copy")}
        </button>
      </div>

      <p className="mt-3 font-mono text-[11px] text-fg-3">
        {t("rules.savedNote", { tokens: fmtTokens(wasted), n: rules.length })}
      </p>

      <ol className="mt-5 flex flex-col gap-4">
        {rules.map((rule, i) => (
          <li key={`${rule.kind}-${i}`} className="border-l-2 border-line-2 pl-4">
            <p className="text-sm leading-relaxed text-fg">{rule.body}</p>
            <p className="mt-1.5 font-mono text-[11px] text-fg-3">{rule.evidence}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
