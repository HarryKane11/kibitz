import { BrandOrNothing } from "@/components/brand";
import { brandForSource } from "@/lib/brand";
import { notFound } from "next/navigation";
import { getRun } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Crumbs } from "@/components/page";
import { TraceExplorer } from "@/components/trace-explorer";
import { fmtDuration, fmtTokens, fmtUsd } from "@/lib/verdict";

export default async function RunTimelinePage(
  props: PageProps<"/traces/[runId]/timeline">,
) {
  const { runId } = await props.params;
  const t = await getT();
  const run = await getRun(runId);
  if (!run) notFound();

  return (
    <div>
      <div className="mx-auto max-w-[1440px] px-8 pt-8 pb-5">
        <Crumbs
          items={[
            { label: t("traces.title"), href: "/traces" },
            { label: run.id, href: `/traces/${run.id}` },
            { label: t("traces.timeline") },
          ]}
        />

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="line-clamp-2 max-w-3xl text-3xl font-semibold tracking-tight">
              {run.title}
              <span className="text-fg-2">{run.titleTail}</span>
            </h1>
            <p className="mt-2 flex flex-wrap gap-2.5 text-xs text-fg-3">
              {run.source && (
                <span className="flex items-center gap-1 font-mono">
                  <BrandOrNothing name={brandForSource(run.source)} className="h-3 w-3" />
                  {run.source}
                </span>
              )}
              <span className="font-mono">{run.agent}</span>
              <span>{t("traces.turnCount", { n: run.turns.length })}</span>
              <span>{fmtDuration(run.durationMs, t)}</span>
              <span>{fmtTokens(run.totalTokens)}</span>
              <span>{fmtUsd(run.costUsd)}</span>
            </p>
          </div>

          <p className="flex items-center gap-2 text-xs text-fg-3">
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px]">
              ←
            </kbd>
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px]">
              →
            </kbd>
            {t("traces.moveTurn")}
          </p>
        </div>
      </div>

      <TraceExplorer run={run} />
    </div>
  );
}
