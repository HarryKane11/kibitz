import { listEvaluators } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { EVALUATOR_KIND_KEY, SCORE_TYPE_KEY } from "@/lib/types";
import { Page, PageHeader, Card, Chip, EmptyState } from "@/components/page";
import { relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function EvaluatorsPage() {
  const t = await getT();
  const evaluators = await listEvaluators();

  return (
    <Page>
      <PageHeader title={t("evaluators.title")} subtitle={t("evaluators.subtitle")} />

      {evaluators.length === 0 ? (
        <EmptyState message={t("evaluators.empty")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {evaluators.map((e) => (
            <Card key={e.id} as="li">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
                    {e.name}
                    <Chip>{t(`evaluators.${EVALUATOR_KIND_KEY[e.kind]}`)}</Chip>
                    <Chip>{t(`scores.${SCORE_TYPE_KEY[e.dataType]}`)}</Chip>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        e.enabled ? "text-fg-2" : "text-fg-3",
                      )}
                    >
                      {e.enabled ? t("evaluators.enabled") : t("evaluators.disabled")}
                    </span>
                  </h2>

                  {/* 결정론과 모델 채점을 같은 무게로 그리지 않는다 */}
                  <p
                    className={cn(
                      "mt-2 max-w-2xl rounded-r-sm border-l-2 px-3 py-2 text-sm leading-relaxed",
                      e.kind === "model"
                        ? "border-warn bg-warn/[0.055] text-fg-2"
                        : "border-line text-fg-2",
                    )}
                  >
                    {e.kind === "model"
                      ? t("evaluators.modelNote")
                      : e.kind === "deterministic"
                        ? t("evaluators.deterministicNote")
                        : t("evaluators.subtitle")}
                  </p>

                  {e.rule && (
                    <p className="mt-2 font-mono text-xs leading-relaxed text-fg">
                      {t("failure.rule")} · {e.rule}
                    </p>
                  )}
                  {e.model && (
                    <p className="mt-2 font-mono text-xs text-fg-3">{e.model}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-6">
                  <div>
                    <p className="text-xl font-semibold tracking-tight">{e.scoresProduced}</p>
                    <p className="mt-1 text-xs tracking-wide text-fg-3 uppercase">
                      {t("evaluators.scoresProduced")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-2">
                      {e.lastRunAt === "—" ? "—" : relTime(e.lastRunAt)}
                    </p>
                    <p className="mt-1 text-xs tracking-wide text-fg-3 uppercase">
                      {t("evaluators.lastRun")}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </Page>
  );
}
