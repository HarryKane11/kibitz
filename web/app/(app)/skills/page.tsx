import Link from "next/link";
import { FileText, Terminal } from "lucide-react";
import { listSkillCandidates } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { Page, PageHeader, Card, Chip, EmptyState } from "@/components/page";
import { fmtDuration, fmtTokens } from "@/lib/verdict";
import { cn } from "@/lib/utils";

export default async function SkillsPage() {
  const t = await getT();
  const candidates = await listSkillCandidates();

  return (
    <Page>
      <PageHeader title={t("skills.title")} subtitle={t("skills.subtitle")} />

      <p className="mb-5 border-y border-hair py-4 text-sm text-fg-2">
        {t("skills.note")} <span className="text-fg-3">{t("skills.noLlm")}</span>
      </p>

      {candidates.length === 0 ? (
        <EmptyState message={t("skills.empty")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {candidates.map((c) => {
            const Icon = c.kind === "command" ? Terminal : FileText;
            return (
              <Card key={c.id} as="li">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                      <code className="font-mono text-[15px] font-medium text-fg">
                        {c.signature}
                      </code>
                      <Chip>
                        {t(c.kind === "command" ? "skills.kindCommand" : "skills.kindFile")}
                      </Chip>
                      {c.sources.map((s) => (
                        <Chip key={s}>{s}</Chip>
                      ))}
                    </div>

                    {/* 제안이 무엇에서 나왔는지 — 근거 없이 "이걸 스킬로" 라고 하지 않는다 */}
                    <p className="mb-1 text-[11px] tracking-wide text-fg-3 uppercase">
                      {t("skills.examples")}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {c.examples.map((ex) => (
                        <li
                          key={ex}
                          className="truncate font-mono text-xs text-fg-2"
                          title={ex}
                        >
                          {ex}
                        </li>
                      ))}
                    </ul>

                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-3">
                      <span className="tracking-wide uppercase">{t("skills.seenIn")}</span>
                      {c.runIds.map((id) => (
                        <Link
                          key={id}
                          href={`/traces/${id}`}
                          className="font-mono transition-colors duration-100 hover:text-fg-2"
                        >
                          {id}
                        </Link>
                      ))}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-6 lg:border-l lg:border-hair lg:pl-6">
                    <Stat
                      n={String(c.runIds.length)}
                      l={t("skills.sessions")}
                      tone={c.runIds.length >= 4 ? "" : "text-fg-2"}
                    />
                    <Stat n={String(c.occurrences)} l={t("skills.occurrences")} />
                    <Stat n={fmtTokens(c.tokens)} l={t("skills.spent")} />
                    <Stat n={fmtDuration(c.ms, t)} l={t("dashboard.latency")} />
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function Stat({ n, l, tone }: { n: string; l: string; tone?: string }) {
  return (
    <div>
      <p className={cn("text-2xl font-semibold tracking-tight", tone)}>{n}</p>
      <p className="mt-1 text-[11px] tracking-wide text-fg-3 uppercase">{l}</p>
    </div>
  );
}
