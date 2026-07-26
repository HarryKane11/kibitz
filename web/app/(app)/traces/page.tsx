import { allRuns, filterShortcuts, queryRuns } from "@/lib/data";
import { fromParams } from "@/lib/query";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, EmptyState } from "@/components/page";
import { FilterBuilder } from "@/components/filter-builder";
import { TraceTable } from "@/components/trace-table";

export default async function TracesPage(props: PageProps<"/traces">) {
  const sp = await props.searchParams;
  const t = await getT();
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const query = fromParams(one);
  const runs = await queryRuns(query);
  const shortcuts = await filterShortcuts();

  return (
    <Page>
      <PageHeader title={t("traces.title")} subtitle={t("traces.subtitle")} />

      <FilterBuilder
        shortcuts={shortcuts}
        matched={runs.length}
        total={allRuns().length}
      />

      {runs.length === 0 ? (
        <EmptyState message={t("traces.empty")} />
      ) : (
        <TraceTable runs={runs} />
      )}
    </Page>
  );
}
