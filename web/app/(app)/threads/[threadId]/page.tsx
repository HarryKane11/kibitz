import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Paperclip, TriangleAlert } from "lucide-react";
import { getThread } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs, Chip } from "@/components/page";
import { fmtDuration, fmtUsd } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function ThreadPage(props: PageProps<"/threads/[threadId]">) {
  const { threadId } = await props.params;
  const t = await getT();
  const thread = await getThread(decodeURIComponent(threadId));
  if (!thread) notFound();

  return (
    <Page>
      <Crumbs
        items={[{ label: t("threads.title"), href: "/threads" }, { label: thread.id }]}
      />
      <PageHeader
        title={thread.id}
        subtitle={t("threads.subtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Chip>{t("threads.turns")} {thread.turns.length}</Chip>
            <Chip>{fmtUsd(thread.totalCostUsd)}</Chip>
            {thread.userId && <Chip>{thread.userId}</Chip>}
          </div>
        }
      />

      {/* 대화 — 요청 묶음 하나가 한 턴이다 */}
      <ol className="flex flex-col gap-5">
        {thread.turns.map((turn, i) => (
          <li key={`${turn.runId}-${turn.index}`} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              <span>{i + 1}</span>
              <span>{t("threads.userSaid")}</span>
              {turn.attachments > 0 && (
                <span className="flex items-center gap-1 normal-case">
                  <Paperclip className="h-2.5 w-2.5" aria-hidden />
                  {turn.attachments}
                </span>
              )}
            </div>
            <p className="max-w-3xl rounded-lg rounded-tl-sm border border-line bg-ink-800 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
              {turn.userText}
            </p>

            <div className="flex flex-wrap items-baseline gap-2 pt-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              <span>{t("threads.agentSaid")}</span>
              <span className="normal-case">
                {t("traces.obsCount", { n: turn.observations })}
              </span>
              <span className="normal-case">{fmtDuration(turn.durationMs, t)}</span>
              <span className="normal-case">{fmtUsd(turn.costUsd)}</span>
              {turn.verdicts > 0 && (
                <span className="flex items-center gap-1 text-warn normal-case">
                  <TriangleAlert className="h-2.5 w-2.5" aria-hidden />
                  {t("traces.verdicts", { n: turn.verdicts })}
                </span>
              )}
            </div>

            <div
              className={cn(
                "max-w-3xl self-end rounded-lg rounded-tr-sm border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                turn.verdicts > 0
                  ? "border-warn/30 bg-warn/[0.04] text-fg-2"
                  : "border-hair bg-ink-750 text-fg-2",
              )}
            >
              {turn.answerText ?? (
                <span className="text-fg-3">{t("threads.noAnswer")}</span>
              )}
            </div>

            <Link
              href={`/traces/${turn.runId}/timeline?obs=${turn.index}`}
              className="flex items-center gap-1 self-end text-xs text-fg-3 transition-colors duration-100 hover:text-fg-2"
            >
              {t("threads.openTrace")}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </Page>
  );
}
