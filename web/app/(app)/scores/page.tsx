import Link from "next/link";
import { listScores } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { SCORE_SOURCE_KEY, SCORE_TYPE_KEY, type Score } from "@/lib/types";
import { Page, PageHeader, Card, Chip, EmptyState } from "@/components/page";
import { ScoreCharts } from "@/components/score-charts";
import { relTime } from "@/lib/verdict";

/** 이름별로 묶는다 — 스코어는 개별 행보다 이름 단위 분포가 먼저 읽혀야 한다. */
function groupByName(scores: Score[]) {
  const m = new Map<string, Score[]>();
  for (const s of scores) {
    const list = m.get(s.name) ?? [];
    list.push(s);
    m.set(s.name, list);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

export default async function ScoresPage() {
  const t = await getT();
  const scores = await listScores();
  const groups = groupByName(scores);

  return (
    <Page>
      <PageHeader title={t("scores.title")} subtitle={t("scores.subtitle")} />

      {groups.length === 0 ? (
        <EmptyState message={t("scores.empty")} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([name, list]) => {
            const first = list[0];
            const numeric = first.dataType === "NUMERIC";
            const values = list.map((s) => s.value ?? 0);
            const cats = new Map<string, number>();
            for (const s of list) {
              const k = s.stringValue ?? String(s.value ?? "");
              cats.set(k, (cats.get(k) ?? 0) + 1);
            }

            return (
              <Card key={name}>
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
                      {name}
                      <Chip>{t(`scores.${SCORE_TYPE_KEY[first.dataType]}`)}</Chip>
                      <Chip>{t(`scores.${SCORE_SOURCE_KEY[first.source]}`)}</Chip>
                    </h2>
                    <p className="mt-1 text-xs text-fg-3">
                      {list.length} {t("common.items")} · {relTime(list[0].createdAt)}
                    </p>
                  </div>
                  {first.evaluatorId && (
                    <Link
                      href="/evaluators"
                      className="font-mono text-xs text-fg-3 transition-colors hover:text-fg-2"
                    >
                      {first.evaluatorId}
                    </Link>
                  )}
                </header>

                <ScoreCharts
                  numeric={numeric}
                  values={values}
                  categories={[...cats.entries()].map(([label, count]) => ({ label, count }))}
                  distributionTitle={t("scores.distribution")}
                />

                {list.some((s) => s.comment) && (
                  <ul className="mt-4 flex flex-col gap-2 border-t border-hair pt-3">
                    {list
                      .filter((s) => s.comment)
                      .slice(0, 3)
                      .map((s) => (
                        <li key={s.id} className="text-sm text-fg-2">
                          <Link
                            href={`/traces/${s.traceId}`}
                            className="font-mono text-xs text-fg-3 transition-colors hover:text-fg-2"
                          >
                            {s.traceId}
                          </Link>{" "}
                          — {s.comment}
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
