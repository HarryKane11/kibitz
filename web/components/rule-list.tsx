"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import type { RunStatus } from "@/lib/types";
import { ACTION_ORDER, type Action, type Rule } from "@/lib/automations";
import { useT } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/shared";
import { Card } from "@/components/page";
import { STATUS_TEXT } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<Action, MessageKey> = {
  queue: "automations.actionQueue",
  dataset: "automations.actionDataset",
  webhook: "automations.actionWebhook",
  evaluator: "automations.actionEvaluator",
  retention: "automations.actionRetention",
};

export interface RuleRow {
  rule: Rule;
  query: string;
  matched: number;
  acted: number;
  sample: { id: string; title: string; status: RunStatus; skipped: boolean }[];
}

export function RuleList({ rules, total }: { rules: RuleRow[]; total: number }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-line bg-ink-800 px-5 py-4">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-2" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{t("automations.dryRun")}</p>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {t("automations.dryRunNote")}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {rules.map((row) => {
          const expanded = open === row.rule.id;
          return (
            <Card key={row.rule.id} as="li">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight">
                      {row.rule.name}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        row.rule.enabled
                          ? "border-line-2 text-fg-2"
                          : "border-dashed border-line text-fg-3",
                      )}
                    >
                      {t(row.rule.enabled ? "automations.enabled" : "automations.disabled")}
                    </span>
                  </div>

                  <code className="block overflow-x-auto font-mono text-xs whitespace-nowrap text-fg-3">
                    {row.query}
                  </code>

                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {/* 액션은 정의 순서가 아니라 실행 순서로 보여준다 */}
                    {ACTION_ORDER.filter((a) => row.rule.actions.includes(a)).map((a) => (
                      <li
                        key={a}
                        className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2"
                      >
                        {t(ACTION_LABEL[a])}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex shrink-0 gap-6 lg:border-l lg:border-hair lg:pl-6">
                  <Stat
                    n={`${row.matched}`}
                    l={t("automations.matches")}
                    tone={row.matched > 0 ? "" : "text-fg-3"}
                  />
                  <Stat n={`${row.rule.sampling}`} l={t("automations.sampling")} />
                  <Stat n={`${row.acted}`} l={t("automations.processed")} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-2.5">
                <p className="text-xs text-fg-3">
                  {t("automations.wouldMatch", { n: row.matched, total })}
                  {row.rule.sampling < 1 && (
                    <> · {t("automations.estimated", { n: row.acted })}</>
                  )}
                </p>
                <button
                  onClick={() => setOpen(expanded ? null : row.rule.id)}
                  aria-expanded={expanded}
                  className="flex items-center gap-1 text-xs text-fg-2 transition-colors duration-100 active:scale-[0.97] hover:text-fg"
                >
                  <ChevronRight
                    className={cn("h-3 w-3", expanded && "rotate-90")}
                    aria-hidden
                  />
                  {t("automations.logs")}
                </button>
              </div>

              {expanded && (
                <div className="mt-2.5">
                  {row.sample.length === 0 ? (
                    <p className="py-2 text-xs text-fg-3">{t("common.noData")}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {row.sample.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/traces/${s.id}`}
                            className="flex items-center gap-3 border-b border-hair py-1.5 text-xs transition-colors duration-100 last:border-b-0 hover:bg-hover"
                          >
                            <span className="font-mono text-fg-3">{s.id}</span>
                            <span className={cn("shrink-0", STATUS_TEXT[s.status])}>
                              {t(`status.${s.status}`)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-fg-2">
                              {s.title}
                            </span>
                            {s.skipped && (
                              <span className="shrink-0 rounded-full border border-dashed border-line px-1.5 text-[10.5px] text-fg-3">
                                {t("automations.sampling")}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-fg-3">
                    {t("automations.samplingNote")} {t("automations.order")}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ n, l, tone }: { n: string; l: string; tone?: string }) {
  return (
    <div>
      <p className={cn("text-2xl font-semibold tracking-tight", tone)}>{n}</p>
      <p className="mt-1 text-[11px] tracking-wide text-fg-3 uppercase">{l}</p>
    </div>
  );
}
