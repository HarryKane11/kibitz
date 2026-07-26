import { listPrompts } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, ColumnHeads, EmptyState, Row, Chip } from "@/components/page";
import { relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_80px_110px]";

export default async function PromptsPage() {
  const t = await getT();
  const prompts = await listPrompts();

  return (
    <Page>
      <PageHeader title={t("prompts.title")} subtitle={t("prompts.subtitle")} />

      <ColumnHeads
        cols={[t("prompts.name"), t("prompts.labels"), t("prompts.versions"), t("prompts.updated")]}
        className={COLS}
      />

      {prompts.length === 0 ? (
        <EmptyState message={t("prompts.empty")} />
      ) : (
        <ul className="flex flex-col gap-1">
          {prompts.map((p) => (
            <Row key={p.id} href={`/prompts/${encodeURIComponent(p.name)}`} className={cn(COLS, "lg:gap-5")}>
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{p.name}</p>
                <p className="mt-1 flex gap-2.5 text-xs text-fg-3">
                  <span>{p.type === "chat" ? t("prompts.typeChat") : t("prompts.typeText")}</span>
                  <span>{t("prompts.usedBy", { n: p.versions[0].usageCount })}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                {p.versions[0].labels.map((l) => (
                  <Chip key={l} tone={l === "production" ? "solid" : "default"}>
                    {l}
                  </Chip>
                ))}
              </div>
              <p className="text-sm text-fg-2 lg:text-right">{p.versions.length}</p>
              <p className="text-xs text-fg-3 lg:text-right">{relTime(p.updatedAt)}</p>
            </Row>
          ))}
        </ul>
      )}
    </Page>
  );
}
