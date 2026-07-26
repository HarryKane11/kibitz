import { notFound } from "next/navigation";
import { filterRuns, getSession } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs, Card, KeyValue, Row } from "@/components/page";
import { MiniRibbon } from "@/components/viz";
import { STATUS_TEXT, fmtDuration, fmtTokens, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function SessionDetailPage(props: PageProps<"/sessions/[sessionId]">) {
  const { sessionId } = await props.params;
  const id = decodeURIComponent(sessionId);
  const t = await getT();
  const session = await getSession(id);
  if (!session) notFound();

  const runs = await filterRuns({ sessionId: id });

  return (
    <Page>
      <Crumbs items={[{ label: t("sessions.title"), href: "/sessions" }, { label: id }]} />
      <PageHeader title={id} />

      <div className="grid grid-cols-1 gap-3 pb-8 lg:grid-cols-3">
        <Card>
          <KeyValue
            rows={[
              { k: t("users.userId"), v: session.userId ?? "—", mono: true },
              { k: t("sessions.traceCount"), v: String(session.traceIds.length) },
              { k: t("sessions.duration"), v: fmtDuration(session.durationMs) },
            ]}
          />
        </Card>
        <Card>
          <KeyValue
            rows={[
              { k: t("sessions.totalCost"), v: fmtUsd(session.totalCostUsd), mono: true },
              { k: t("dashboard.tokens"), v: fmtTokens(session.totalTokens), mono: true },
              { k: t("traces.accuracy"), v: `${session.accuracy}%` },
            ]}
          />
        </Card>
        <Card>
          <KeyValue
            rows={[
              { k: t("time.range"), v: relTime(session.startedAt) },
              { k: t("sessions.lastActivity"), v: relTime(session.endedAt) },
            ]}
          />
        </Card>
      </div>

      <h2 className="mb-2.5 text-base font-semibold tracking-tight">
        {t("sessions.tracesInSession")}
      </h2>
      <ul className="flex flex-col gap-1">
        {runs.map((r) => (
          <Row key={r.id} href={`/traces/${r.id}`} className="lg:grid-cols-[minmax(0,1fr)_176px_64px]">
            <div className="min-w-0">
              <p className="truncate text-base font-medium">
                {r.title}
                <span className="text-fg-2">{r.titleTail}</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-2.5 text-xs text-fg-3">
                <span className="font-mono">{r.id}</span>
                <span>{fmtDuration(r.durationMs)}</span>
                <span className={STATUS_TEXT[r.status]}>{t(`status.${r.status}`)}</span>
              </p>
            </div>
            <div className="hidden lg:block">
              <MiniRibbon turns={r.turns} />
            </div>
            <p
              className={cn(
                "text-base font-semibold lg:text-right",
                r.score.accuracy < 70 ? "text-crit" : "text-fg",
              )}
            >
              {r.score.accuracy}%
            </p>
          </Row>
        ))}
      </ul>
    </Page>
  );
}
