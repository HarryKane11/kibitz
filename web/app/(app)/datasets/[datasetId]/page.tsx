import { notFound } from "next/navigation";
import { getDataset } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs, Card, Stat } from "@/components/page";
import { RunMatrix } from "@/components/run-matrix";
import { fmtUsd, relTime } from "@/lib/verdict";

export default async function DatasetDetailPage(props: PageProps<"/datasets/[datasetId]">) {
  const { datasetId } = await props.params;
  const t = await getT();
  const ds = await getDataset(datasetId);
  if (!ds) notFound();

  return (
    <Page>
      <Crumbs items={[{ label: t("datasets.title"), href: "/datasets" }, { label: ds.name }]} />
      <PageHeader title={ds.name} subtitle={ds.description} />

      <div className="flex flex-wrap gap-8 border-y border-hair py-5">
        <Stat n={String(ds.items.length)} l={t("datasets.items")} />
        <Stat n={String(ds.runs.length)} l={t("datasets.runs")} />
        {ds.runs[0] && (
          <>
            <Stat
              n={`${ds.runs[0].passRate}%`}
              l={t("datasets.passRate")}
              tone={ds.runs[0].passRate < 70 ? "crit" : undefined}
            />
            <Stat n={fmtUsd(ds.runs[0].totalCostUsd)} l={t("sessions.totalCost")} tone="muted" />
          </>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold tracking-tight">{t("datasets.runComparison")}</h2>
        <p className="mt-1.5 mb-4 max-w-2xl text-sm text-fg-2">
          {t("datasets.comparisonHint")}
        </p>
        <RunMatrix dataset={ds} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-base font-semibold tracking-tight">{t("datasets.items")}</h2>
        <ul className="flex flex-col gap-2">
          {ds.items.map((it) => (
            <Card key={it.id} as="li">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-fg-3 uppercase">
                    {t("datasets.input")}
                  </p>
                  <p className="text-sm text-fg">{it.input}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-fg-3 uppercase">
                    {t("datasets.expectedOutput")}
                  </p>
                  <p className="font-mono text-sm text-fg-2">{it.expectedOutput}</p>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-xs text-fg-3">{relTime(ds.updatedAt)}</p>
    </Page>
  );
}
