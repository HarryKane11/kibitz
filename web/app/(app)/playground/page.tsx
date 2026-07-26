import Link from "next/link";
import { getRun } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Crumbs, EmptyState } from "@/components/page";
import { Playground } from "@/components/playground";

export default async function PlaygroundPage(props: PageProps<"/playground">) {
  const sp = await props.searchParams;
  const t = await getT();
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const runId = one("run");
  const turnIndex = Number(one("turn"));
  const run = runId ? await getRun(runId) : undefined;
  const turn = run?.turns.find((x) => x.index === turnIndex);

  if (!run || !turn) {
    return (
      <Page>
        <PageHeader title={t("playground.title")} subtitle={t("playground.subtitle")} />
        <EmptyState message={t("playground.pickObservation")} />
        <Link
          href="/traces"
          className="mt-4 inline-flex rounded-full border border-line px-4 py-1.5 text-sm font-medium text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg"
        >
          {t("traces.title")}
        </Link>
      </Page>
    );
  }

  return (
    <Page>
      <Crumbs
        items={[
          { label: t("traces.title"), href: "/traces" },
          { label: run.id, href: `/traces/${run.id}` },
          { label: t("playground.title") },
        ]}
      />
      <PageHeader
        title={t("playground.title")}
        subtitle={t("playground.fromTrace", { run: run.id, n: turn.index })}
      />
      <Playground run={run} turn={turn} />
    </Page>
  );
}
