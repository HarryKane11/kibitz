import { allRuns } from "@/lib/data";
import { DEFAULT_RULES, evaluateRule } from "@/lib/automations";
import { toQueryLanguage } from "@/lib/query";
import { getT } from "@/lib/i18n";
import { Page, PageHeader } from "@/components/page";
import { RuleList } from "@/components/rule-list";
import { loadResources } from "@/lib/resource-store";

export default async function AutomationsPage() {
  const t = await getT();
  const runs = allRuns();

  // 매칭은 서버에서 실제 런에 대해 계산한다 — 화면이 지어낸 숫자를 들고 있지 않게.
  const persistedRules = loadResources("automations", DEFAULT_RULES);
  const rules = persistedRules.map((rule) => {
    const hits = evaluateRule(rule, runs);
    return {
      rule,
      query: toQueryLanguage(rule.query),
      matched: hits.length,
      acted: hits.filter((h) => !h.skipped).length,
      sample: hits.slice(0, 6).map((h) => ({
        id: h.run.id,
        title: h.run.title,
        status: h.run.status,
        skipped: h.skipped,
      })),
    };
  });

  return (
    <Page>
      <PageHeader title={t("automations.title")} subtitle={t("automations.subtitle")} />
      <RuleList rules={rules} total={runs.length} />
    </Page>
  );
}
