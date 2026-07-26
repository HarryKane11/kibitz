"use client";

import { useMemo, useState } from "react";
import type { Prompt } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { Card, Chip, KeyValue } from "@/components/page";
import { relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 버전 이력 + 줄 단위 diff.
 *
 * 프롬프트 관리의 핵심은 "무엇이 바뀌어서 결과가 달라졌나"다. 그래서 내용만
 * 보여주는 것으로는 부족하고, 이전 버전과의 차이가 기본으로 보여야 한다.
 * diff 는 줄 단위 LCS — 라이브러리 없이 충분하다.
 */
function diffLines(a: string, b: string) {
  const A = a.split("\n");
  const B = b.split("\n");
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: { kind: "same" | "add" | "del"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: B[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: A[i++] });
    } else {
      out.push({ kind: "add", text: B[j++] });
    }
  }
  while (i < m) out.push({ kind: "del", text: A[i++] });
  while (j < n) out.push({ kind: "add", text: B[j++] });
  return out;
}

export function PromptVersions({ prompt }: { prompt: Prompt }) {
  const t = useT();
  const [selected, setSelected] = useState(prompt.versions[0].version);

  const current = prompt.versions.find((v) => v.version === selected)!;
  const previous = prompt.versions.find((v) => v.version === selected - 1);
  const diff = useMemo(
    () => (previous ? diffLines(previous.content, current.content) : null),
    [previous, current],
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside>
        <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
          {t("prompts.versionHistory")}
        </p>
        <ul className="flex flex-col gap-1">
          {prompt.versions.map((v) => (
            <li key={v.version}>
              <button
                onClick={() => setSelected(v.version)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors duration-100",
                  v.version === selected
                    ? "border-line-2 bg-ink-600"
                    : "border-hair hover:border-line-2",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t("prompts.version", { n: v.version })}
                  </span>
                  {v.labels.includes("production") && <Chip tone="solid">production</Chip>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-fg-3">
                  {v.commitMessage}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex flex-col gap-4">
        <Card>
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              {t("prompts.version", { n: current.version })}
              {current.labels.map((l) => (
                <Chip key={l} tone={l === "production" ? "solid" : "default"}>
                  {l}
                </Chip>
              ))}
            </h2>
            <p className="text-xs text-fg-3">
              {current.authorUserId} · {relTime(current.createdAt)}
            </p>
          </header>

          <p className="mb-3 text-sm text-fg-2">{current.commitMessage}</p>

          <p className="mb-1.5 text-xs font-medium tracking-wide text-fg-3 uppercase">
            {t("prompts.content")}
          </p>
          <pre className="overflow-x-auto rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">
            {current.content}
          </pre>
        </Card>

        <Card>
          <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
            {t("prompts.config")}
          </p>
          <KeyValue
            rows={Object.entries(current.config).map(([k, v]) => ({
              k,
              v: String(v),
              mono: true,
            }))}
          />
        </Card>

        {diff && (
          <Card>
            <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
              {t("prompts.diffWith", { n: current.version - 1 })}
            </p>
            {diff.every((d) => d.kind === "same") ? (
              <p className="text-sm text-fg-3">{t("prompts.noChange")}</p>
            ) : (
              <pre className="overflow-x-auto rounded-sm border border-hair bg-ink-750 font-mono text-xs leading-relaxed">
                {diff.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "px-3 py-0.5 whitespace-pre-wrap",
                      d.kind === "add" && "bg-[color-mix(in_oklab,var(--color-cat-4)_12%,transparent)] text-fg",
                      d.kind === "del" && "bg-crit/[0.10] text-fg-2 line-through decoration-crit/50",
                      d.kind === "same" && "text-fg-3",
                    )}
                  >
                    <span className="mr-2 inline-block w-3 select-none text-fg-3">
                      {d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "}
                    </span>
                    {d.text || " "}
                  </div>
                ))}
              </pre>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
