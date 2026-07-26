import { listUsers } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, ColumnHeads, EmptyState, Row } from "@/components/page";
import { fmtTokens, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_90px_90px_90px_130px]";

export default async function UsersPage() {
  const t = await getT();
  const users = await listUsers();

  return (
    <Page>
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} />

      <ColumnHeads
        cols={[
          t("users.userId"),
          t("users.traceCount"),
          t("users.avgAccuracy"),
          t("users.totalCost"),
          t("users.lastSeen"),
        ]}
        className={COLS}
      />

      {users.length === 0 ? (
        <EmptyState message={t("users.empty")} />
      ) : (
        <ul className="flex flex-col gap-1">
          {users.map((u) => (
            <Row key={u.id} href={`/users/${encodeURIComponent(u.id)}`} className={cn(COLS, "lg:gap-5")}>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-fg">{u.id}</p>
                <p className="mt-1 text-xs text-fg-3">
                  {u.sessionCount} {t("nav.sessions")} · {fmtTokens(u.totalTokens)}
                </p>
              </div>
              <p className="text-sm text-fg-2 lg:text-right">{u.traceCount}</p>
              <p
                className={cn(
                  "text-sm font-semibold lg:text-right",
                  u.accuracy < 70 ? "text-crit" : "text-fg",
                )}
              >
                {u.accuracy}%
              </p>
              <p className="font-mono text-xs text-fg-3 lg:text-right">{fmtUsd(u.totalCostUsd)}</p>
              <p className="text-xs text-fg-3 lg:text-right">{relTime(u.lastSeenAt)}</p>
            </Row>
          ))}
        </ul>
      )}
    </Page>
  );
}
