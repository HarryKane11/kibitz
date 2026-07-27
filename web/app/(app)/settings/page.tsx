import { BrandOrNothing } from "@/components/brand";
import { brandForProvider } from "@/lib/brand";
import { getT } from "@/lib/i18n";
import { FAILURE_RULE, type FailureKind } from "@/lib/types";
import { Page, PageHeader, Card } from "@/components/page";
import { LocaleSwitcher } from "@/components/i18n-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { providerStatuses } from "@/lib/analysis/run";

// 규칙 목록은 규칙 표에서 그대로 나온다 — 손으로 적으면 규칙이 늘 때 빠진다.
const RULES = Object.keys(FAILURE_RULE) as FailureKind[];

export default async function SettingsPage() {
  const [t, providers] = await Promise.all([getT(), providerStatuses()]);
  const codeAgents = providers.filter(
    (provider) => provider.authMode === "cli-session",
  );

  return (
    <Page>
      <PageHeader title={t("settings.title")} />

      <div className="flex max-w-3xl flex-col gap-4">
        <Card>
          <h2 className="text-sm font-semibold tracking-tight">{t("settings.language")}</h2>
          <p className="mt-1 text-sm text-fg-2">{t("settings.languageHint")}</p>
          <LocaleSwitcher className="mt-3" />
        </Card>

        <Card>
          <h2 className="text-sm font-semibold tracking-tight">{t("settings.appearance")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {t("settings.appearanceHint")}
          </p>
          <ThemeSwitcher className="mt-3" />
        </Card>

        <Card>
          <h2 className="text-sm font-semibold tracking-tight">{t("settings.detection")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">{t("settings.detectionHint")}</p>
          <dl className="mt-4 flex flex-col gap-2 border-t border-hair pt-3">
            {RULES.map((k) => (
              <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <dt className="w-52 shrink-0 text-sm text-fg">{t(`failure.${k}`)}</dt>
                <dd className="font-mono text-xs leading-relaxed text-fg-3">{FAILURE_RULE[k]}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold tracking-tight">
            {t("settings.codeAgentAccounts")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {t("settings.codeAgentAccountsHint")}
          </p>
          <dl className="mt-4 flex flex-col gap-2 border-t border-hair pt-3">
            {codeAgents.map((provider) => (
              <div
                key={provider.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <dt className="flex items-center gap-2 text-sm font-medium text-fg">
                      <BrandOrNothing name={brandForProvider(provider.id)} className="h-4 w-4" />
                      {provider.label}
                    </dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      provider.configured
                        ? "text-xs text-ok"
                        : "text-xs text-fg-3"
                    }
                  >
                    {provider.configured
                      ? t("settings.connected")
                      : t("settings.notConnected")}
                  </span>
                  {!provider.configured && provider.loginCommand && (
                    <code className="rounded bg-fill px-2 py-1 font-mono text-[11px] text-fg-3">
                      {provider.loginCommand}
                    </code>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-fg-3">
            {t("settings.codeAgentSecurity")}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold tracking-tight">{t("settings.dataSource")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">{t("settings.dataSourceHint")}</p>
        </Card>
      </div>
    </Page>
  );
}
