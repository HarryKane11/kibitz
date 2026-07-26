import { notFound } from "next/navigation";
import { filterRuns, getUser } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs, Card, KeyValue, Row } from "@/components/page";
import { MiniRibbon } from "@/components/viz";
import { STATUS_TEXT, fmtDuration, fmtTokens, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function UserDetailPage(props: PageProps<"/users/[userId]">) {
  const { userId } = await props.params;
  const id = decodeURIComponent(userId);
  const t = await getT();
  const user = await getUser(id);
  if (!user) notFound();

  const runs = await filterRuns({ userId: id });

  return (
    <Page>
      <Crumbs items={[{ label: t("users.title"), href: "/users" }, { label: id }]} />
      <PageHeader title={id} />

      <div className="grid grid-cols-1 gap-3 pb-8 lg:grid-cols-3">
        <Card>
          <KeyValue
            rows={[
              { k: t("users.traceCount"), v: String(user.traceCount) },
              { k: t("nav.sessions"), v: String(user.sessionCount) },
            ]}
          />
        </Card>
        <Card>
          <KeyValue
            rows={[
              { k: t("users.totalCost"), v: fmtUsd(user.totalCostUsd), mono: true },
              { k: t("dashboard.tokens"), v: fmtTokens(user.totalTokens), mono: true },
            ]}
          />
        </Card>
        <Card>
          <KeyValue
            rows={[
              { k: t("users.avgAccuracy"), v: `${user.accuracy}%` },
              { k: t("users.lastSeen"), v: relTime(user.lastSeenAt) },
            ]}
          />
        </Card>
      </div>

      <h2 className="mb-2.5 text-base font-semibold tracking-tight">{t("users.userTraces")}</h2>
      <ul className="flex flex-col gap-1">
        {runs.map((r) => (
          <Row key={r.id} href={`/traces/${r.id}`} className="lg:grid-cols-[minmax(0,1fr)_176px_64px]">
            <div className="min-w-0">
              <p className="truncate text-base font-medium">
                {r.title}
                <span className="text-fg-2">{r.titleTail}</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-2.5 text-xs text-fg-3">
                <span className="font-mono">{r.agent}</span>
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
