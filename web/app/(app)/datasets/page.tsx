import { listDatasets } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, ColumnHeads, EmptyState, Row } from "@/components/page";
import { relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_80px_80px_110px_120px]";

export default async function DatasetsPage() {
  const t = await getT();
  const datasets = await listDatasets();

  return (
    <Page>
      <PageHeader title={t("datasets.title")} subtitle={t("datasets.subtitle")} />

      <ColumnHeads
        cols={[
          t("datasets.name"),
          t("datasets.itemCount"),
          t("datasets.runCount"),
          t("datasets.passRate"),
          t("datasets.lastRun"),
        ]}
        className={COLS}
      />

      {datasets.length === 0 ? (
        <EmptyState message={t("datasets.empty")} />
      ) : (
        <ul className="flex flex-col gap-1">
          {datasets.map((d) => {
            const last = d.runs[0];
            return (
              <Row key={d.id} href={`/datasets/${d.id}`} className={cn(COLS, "lg:gap-5")}>
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{d.name}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-fg-3">{d.description}</p>
                </div>
                <p className="text-sm text-fg-2 lg:text-right">{d.items.length}</p>
                <p className="text-sm text-fg-2 lg:text-right">{d.runs.length}</p>
                <p
                  className={cn(
                    "text-sm font-semibold lg:text-right",
                    last && last.passRate < 70 ? "text-crit" : "text-fg",
                  )}
                >
                  {last ? `${last.passRate}%` : "—"}
                </p>
                <p className="text-xs text-fg-3 lg:text-right">
                  {last ? relTime(last.createdAt) : "—"}
                </p>
              </Row>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
