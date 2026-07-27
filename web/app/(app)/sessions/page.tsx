import { listSessions } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, ColumnHeads, Count, EmptyState, Row } from "@/components/page";
import { fmtDuration, fmtTokens, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_90px_80px_90px_140px]";

export default async function SessionsPage() {
  const t = await getT();
  const sessions = await listSessions();

  return (
    <Page>
      <PageHeader title={t("sessions.title")} subtitle={t("sessions.subtitle")} />

      <ColumnHeads
        cols={[
          t("sessions.sessionId"),
          t("sessions.traceCount"),
          t("traces.accuracy"),
          t("sessions.totalCost"),
          t("sessions.lastActivity"),
        ]}
        className={COLS}
      />

      {sessions.length === 0 ? (
        <EmptyState message={t("sessions.empty")} />
      ) : (
        <ul className="flex flex-col gap-1">
          {sessions.map((s) => (
            <Row key={s.id} href={`/sessions/${encodeURIComponent(s.id)}`} className={cn(COLS, "lg:gap-5")}>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-fg">{s.id}</p>
                <p className="mt-1 flex flex-wrap gap-2.5 text-xs text-fg-3">
                  {s.userId && <span className="font-mono">{s.userId}</span>}
                  <span>{fmtDuration(s.durationMs)}</span>
                  {/* 136.7K 만 있으면 무엇의 136.7K 인지 알 수 없다. */}
                  <span>
                    {fmtTokens(s.totalTokens)} {t("units.unitTokens")}
                  </span>
                </p>
              </div>
              <Count value={s.traceIds.length} unit={t("units.unitTraces", { n: s.traceIds.length })} />
              <p
                className={cn(
                  "text-sm font-semibold lg:text-right",
                  s.accuracy < 70 ? "text-crit" : "text-fg",
                )}
              >
                {s.accuracy}%
              </p>
              <p className="font-mono text-xs text-fg-3 lg:text-right">{fmtUsd(s.totalCostUsd)}</p>
              <p className="text-xs text-fg-3 lg:text-right">{relTime(s.endedAt)}</p>
            </Row>
          ))}
        </ul>
      )}
    </Page>
  );
}
