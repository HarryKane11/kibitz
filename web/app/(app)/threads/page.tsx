import { listThreads } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, ColumnHeads, EmptyState, Row } from "@/components/page";
import { fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_72px_88px_84px_96px]";

export default async function ThreadsPage() {
  const t = await getT();
  const threads = await listThreads();

  return (
    <Page>
      <PageHeader title={t("threads.title")} subtitle={t("threads.subtitle")} />

      {threads.length === 0 ? (
        <EmptyState message={t("threads.empty")} />
      ) : (
        <>
          <ColumnHeads
            cols={[
              t("threads.thread"),
              t("threads.turns"),
              t("threads.verdictsCol"),
              t("dashboard.cost"),
              t("threads.lastTurn"),
            ]}
            className={COLS}
          />
          <ul className="flex flex-col gap-1">
            {threads.map((th) => {
              const verdicts = th.turns.reduce((a, x) => a + x.verdicts, 0);
              return (
                <Row
                  key={th.id}
                  href={`/threads/${encodeURIComponent(th.id)}`}
                  className={cn(COLS, "lg:gap-5")}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-fg">{th.id}</p>
                    <p className="mt-1 truncate text-xs text-fg-3">
                      {th.turns[0]?.userText.slice(0, 110)}
                    </p>
                  </div>
                  <p className="font-mono text-sm text-fg-2 lg:text-right">
                    {th.turns.length}
                  </p>
                  <p
                    className={cn(
                      "font-mono text-sm lg:text-right",
                      verdicts > 0 ? "text-warn" : "text-fg-3",
                    )}
                  >
                    {verdicts}
                  </p>
                  <p className="font-mono text-sm text-fg-3 lg:text-right">
                    {fmtUsd(th.totalCostUsd)}
                  </p>
                  <p className="text-xs text-fg-3 lg:text-right">
                    {relTime(th.startedAt, t)}
                  </p>
                </Row>
              );
            })}
          </ul>
        </>
      )}
    </Page>
  );
}
