import { allRuns, listClusters, listSkillCandidates } from "@/lib/data";
import { buildAgentRules, projectOf, rulesMarkdown } from "@/lib/agent-rules";
import { AgentRulesPanel } from "@/components/agent-rules-panel";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Card, Chip, Stat } from "@/components/page";
import { Sparkline } from "@/components/viz";
import { fmtUsd } from "@/lib/verdict";

export default async function FailuresPage() {
  const t = await getT();
  const [clusters, skills] = await Promise.all([listClusters(), listSkillCandidates()]);
  const totalUsd = clusters.reduce((a, c) => a + c.wastedUsd, 0);

  // 판정을 에이전트가 읽는 문장으로. 모델을 부르지 않는다 — lib/agent-rules.ts 참고.
  const rules = buildAgentRules(clusters, skills);
  const markdown = rulesMarkdown(rules, projectOf(allRuns()));

  return (
    <Page>
      <PageHeader title={t("failures.title")} subtitle={t("failures.subtitle")} />

      <div className="mb-8 border-y border-hair py-5">
        <p className="text-base text-fg-2">
          {t("failures.burnedTotal", { amount: fmtUsd(totalUsd) })}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {clusters.map((c, i) => (
          <Card key={c.kind} as="li" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-fg-3">{t(`failure.${c.kind}`)}</span>
                {i === 0 && <Chip tone="crit">{t("failures.topPriority")}</Chip>}
              </div>
              <h2 className="text-lg font-semibold tracking-tight">{t(`note.${c.kind}`)}</h2>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-fg-2">
                {t(`why.${c.kind}`)}
              </p>
            </div>

            <div className="flex flex-col justify-between gap-4 lg:border-l lg:border-hair lg:pl-6">
              <div className="flex gap-6">
                <Stat n={String(c.runCount)} l={t("failures.affectedRuns")} />
                <Stat n={fmtUsd(c.wastedUsd)} l={t("failures.wastedCost")} />
              </div>
              <div>
                <Sparkline values={c.trend} className="text-fg-3" height={26} />
                <p className="mt-1 text-xs text-fg-3">{t("failures.trend")}</p>
              </div>
            </div>
          </Card>
        ))}
      </ul>

      <AgentRulesPanel rules={rules} markdown={markdown} />
    </Page>
  );
}
