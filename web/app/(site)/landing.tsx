import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Braces,
  Check,
  Database,
  GitBranch,
  Layers3,
  LockKeyhole,
  ScanSearch,
  Server,
  Terminal,
} from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { HeroPanel } from "@/components/hero-panel";
import { KibitzLogo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { MiniRibbon } from "@/components/viz";
import { allRuns } from "@/lib/data";
import { getT } from "@/lib/i18n";
import { buildTree } from "@/lib/tree";
import type { MessageKey } from "@/lib/i18n/shared";

const PLATFORM = [
  { icon: Layers3, title: "decisionTitle", body: "decisionBody", href: "/traces" },
  { icon: ScanSearch, title: "inlineTitle", body: "inlineBody", href: "/failures" },
  { icon: Database, title: "counterfactualTitle", body: "counterfactualBody", href: "/scores" },
  { icon: GitBranch, title: "evidenceTitle", body: "evidenceBody", href: "/playground" },
] as const;

const LONG_RUN_OBJECTS = [
  ["difference1Title", "difference1Body"],
  ["difference2Title", "difference2Body"],
  ["difference3Title", "difference3Body"],
  ["difference4Title", "difference4Body"],
] as const;

export async function Landing() {
  const t = await getT();
  const runs = allRuns();
  const longest = [...runs].sort((a, b) => b.turns.length - a.turns.length)[0];
  const groups = buildTree(longest.turns).length;
  const decisions = runs.reduce(
    (sum, run) => sum + run.turns.filter((turn) => turn.obsType !== "chain").length,
    0,
  );
  const observedKinds = new Set(
    runs.flatMap((run) => run.turns.map((turn) => turn.note?.kind).filter(Boolean)),
  ).size;
  const claims = [
    t("landing.claimDecisions", { n: decisions.toLocaleString() }),
    t("landing.claimNoLlm"),
    t("landing.claimRules", { n: observedKinds }),
    t("landing.claimCost"),
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-900">
      <SiteHeader />

      <main id="main">
        <section className="relative border-b border-hair">
          <div className="brand-grid absolute inset-0 opacity-60" aria-hidden />
          <div className="relative mx-auto max-w-[1240px] px-5 pt-16 pb-12 sm:px-8 sm:pt-24 lg:pt-28">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:items-end">
              <div>
                <p className="flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-fg-3 uppercase">
                  <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                  {t("landing.eyebrow")}
                </p>
                <h1 className="mt-6 max-w-[14ch] text-[48px] leading-[0.98] font-bold tracking-[-0.055em] text-balance sm:text-[72px] lg:text-[84px]">
                  <span className="block">{t("landing.heroA")}</span>
                  <span className="block text-brand">{t("landing.heroB")}</span>
                </h1>
                <p className="mt-7 max-w-[67ch] text-lg leading-relaxed text-fg-2 sm:text-xl">
                  {t("landing.lede")}
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link
                    href="/docs"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-5 font-mono text-[13px] font-semibold text-ink-900 transition-transform duration-100 hover:-translate-y-0.5 focus-visible:ring-2 active:translate-y-0"
                  >
                    {t("landing.openDocs")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <Link
                    href={`/traces/${longest.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-5 font-mono text-[13px] font-semibold text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg focus-visible:ring-2"
                  >
                    {t("landing.openTrace")}
                  </Link>
                </div>
              </div>

              <aside
                className="border-l-2 border-brand pl-5 lg:mb-2"
                aria-label={t("landing.heroAside")}
              >
                <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">
                  {t("landing.heroAside")}
                </p>
                <ol className="mt-4">
                  {(["heroFlow1", "heroFlow2", "heroFlow3", "heroFlow4"] as const).map(
                    (key, index) => (
                      <li
                        key={key}
                        className="grid grid-cols-[24px_1fr] gap-3 border-t border-hair py-3 text-sm leading-relaxed text-fg-2 first:border-t-0"
                      >
                        <span className="font-mono text-xs text-fg-3">0{index + 1}</span>
                        <span>{t(`landing.${key}`)}</span>
                      </li>
                    ),
                  )}
                </ol>
              </aside>
            </div>

            <div className="mt-14">
              <HeroPanel run={longest} />
            </div>
          </div>
        </section>

        <section className="border-b border-hair bg-ink-800">
          <ul className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 sm:px-8">
            {claims.map((claim) => (
              <li key={claim} className="flex items-center gap-2 font-mono text-xs text-fg-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                {claim}
              </li>
            ))}
          </ul>
        </section>

        <section
          id="product"
          className="content-auto scroll-mt-20 mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
            <div>
              <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">
                {t("landing.positionTag")}
              </p>
              <h2 className="mt-4 max-w-[18ch] text-[36px] leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-[50px]">
                {t("landing.positionTitle")}
              </h2>
            </div>
            <p className="max-w-[64ch] text-lg leading-relaxed text-fg-2">
              {t("landing.positionBody")}
            </p>
          </div>

          <figure className="mt-12 overflow-hidden rounded-xl border border-line bg-[#10100f]">
            <Image
              src="/brand/agent-trace-topology.webp"
              alt={t("landing.assetCaption")}
              width={1600}
              height={900}
              sizes="(max-width: 1240px) 100vw, 1180px"
              className="h-auto w-full"
            />
            <figcaption className="border-t border-white/10 bg-[#10100f] px-5 py-3 font-mono text-xs text-[#aaa59b]">
              {t("landing.assetCaption")}
            </figcaption>
          </figure>

          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
            {PLATFORM.map(({ icon: Icon, title, body, href }) => (
              <Link
                key={title}
                href={href}
                className="group min-h-52 bg-ink-900 p-6 transition-colors hover:bg-ink-800 focus-visible:ring-2 sm:p-8"
              >
                <Icon className="h-5 w-5 text-brand" aria-hidden />
                <h3 className="mt-8 text-xl font-semibold">{t(`landing.${title}`)}</h3>
                <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-fg-2">
                  {t(`landing.${body}`)}
                </p>
                <span className="mt-6 inline-flex items-center gap-1 font-mono text-xs text-fg-3 transition-colors group-hover:text-fg">
                  {t("common.showMore")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 max-w-[85ch] text-sm leading-relaxed text-fg-3">
            {t("landing.compareFootnote")}
          </p>
        </section>

        <section className="content-auto border-y border-hair bg-ink-800">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">
                {t("landing.secTrace")}
              </p>
              <h2 className="mt-4 max-w-[15ch] text-[36px] leading-[1.08] font-bold tracking-[-0.04em] text-balance">
                {t("landing.traceTitle")}
              </h2>
              <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-2">
                {t("landing.traceBody")}
              </p>
              <div className="mt-8 rounded-lg border border-line bg-ink-900 p-5">
                <p className="truncate text-base font-medium">
                  {longest.title}
                  <span className="text-fg-2">{longest.titleTail}</span>
                </p>
                <p className="mt-2 font-mono text-xs text-fg-3">
                  {longest.turns.length} observations → {groups} request groups
                </p>
                <div className="mt-4">
                  <MiniRibbon turns={longest.turns} />
                </div>
              </div>
            </div>

            <ol className="border-t border-line">
              {LONG_RUN_OBJECTS.map(([title, body], index) => (
                <li
                  key={title}
                  className="grid gap-3 border-b border-line py-6 sm:grid-cols-[48px_170px_1fr]"
                >
                  <span className="font-mono text-xs text-brand">0{index + 1}</span>
                  <h3 className="text-base font-semibold">{t(`landing.${title}`)}</h3>
                  <p className="text-base leading-relaxed text-fg-2">
                    {t(`landing.${body}`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="connect"
          className="content-auto scroll-mt-20 mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="max-w-3xl">
            <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">
              {t("landing.secIngest")}
            </p>
            <h2 className="mt-4 text-[36px] leading-[1.08] font-bold tracking-[-0.04em] text-balance sm:text-[50px]">
              {t("landing.ingestTitle")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-fg-2">
              {t("landing.ingestBody")}
            </p>
          </div>

          <figure className="mt-12 overflow-hidden rounded-xl border border-line bg-[#0a0b0d]">
            <Image
              src="/brand/agent-ingestion-gateway.webp"
              alt={t("landing.ingestBody")}
              width={1536}
              height={1024}
              sizes="(max-width: 1240px) 100vw, 1180px"
              className="h-auto w-full"
            />
          </figure>

          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <div className="rounded-xl border border-line bg-ink-800 p-5 sm:p-6 lg:col-span-7">
              <Braces className="h-5 w-5 text-brand" aria-hidden />
              <h3 className="mt-6 text-xl font-semibold">{t("landing.sdkTitle")}</h3>
              <p className="mt-2 text-base leading-relaxed text-fg-2">
                {t("landing.sdkBody")}
              </p>
              <div className="mt-6">
                <CodeBlock
                  filename="agent.py"
                  code={`${t("landing.snippetSdkComment")}
from kibitz_sdk import trace, tool

@tool
def search(query: str):
    return db.search(query)

with trace("monthly-report", agent="reporter") as run:
    with run.request("Summarize Q3 revenue"):
        rows = search("revenue 2026 Q3")
        run.answer(summarize(rows))`}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:col-span-5">
              <div className="rounded-xl border border-line bg-ink-800 p-5 sm:p-6">
                <Terminal className="h-5 w-5 text-brand" aria-hidden />
                <h3 className="mt-6 text-xl font-semibold">{t("landing.codeAgentTitle")}</h3>
                <p className="mt-2 text-base leading-relaxed text-fg-2">
                  {t("landing.codeAgentBody")}
                </p>
                <div className="mt-5">
                  <CodeBlock
                    filename="terminal"
                    code={`${t("landing.snippetComment")}
uv run --project agent python -m kibitz_ingest.cli \\
  --source all --limit 8`}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-line bg-ink-800 p-5 sm:p-6">
                <Server className="h-5 w-5 text-brand" aria-hidden />
                <h3 className="mt-6 text-xl font-semibold">{t("landing.httpTitle")}</h3>
                <p className="mt-2 text-base leading-relaxed text-fg-2">
                  {t("landing.httpBody")}
                </p>
                <Link
                  href="/docs#http"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 font-mono text-xs text-brand hover:underline focus-visible:ring-2"
                >
                  POST /api/traces
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="content-auto border-y border-hair bg-ink-800">
          <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <LockKeyhole className="h-6 w-6 text-brand" aria-hidden />
                <h2 className="mt-6 max-w-[14ch] text-[36px] leading-[1.08] font-bold tracking-[-0.04em]">
                  {t("landing.selfHostTitle")}
                </h2>
                <p className="mt-5 max-w-[54ch] text-base leading-relaxed text-fg-2">
                  {t("landing.selfHostBody")}
                </p>
              </div>
              <BulletList
                keys={[
                  "landing.selfHost1",
                  "landing.selfHost2",
                  "landing.selfHost3",
                  "landing.selfHost4",
                ]}
              />
            </div>
            <figure className="mt-12 overflow-hidden rounded-xl border border-line bg-[#0a0b0d]">
              <Image
                src="/brand/self-hosted-trace-archive.webp"
                alt={t("landing.selfHostBody")}
                width={1536}
                height={1024}
                sizes="(max-width: 1240px) 100vw, 1180px"
                className="h-auto w-full"
              />
            </figure>
          </div>
        </section>

        <section className="content-auto mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.65fr_1.35fr]">
            <h2 className="max-w-[13ch] text-[32px] leading-[1.1] font-bold tracking-[-0.035em]">
              {t("landing.honestTitle")}
            </h2>
            <BulletList
              keys={[
                "landing.honestB1",
                "landing.honestB2",
                "landing.honestB3",
                "landing.honestB4",
              ]}
            />
          </div>
        </section>

        <section className="border-t border-hair bg-fg text-ink-900">
          <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="max-w-[18ch] text-[36px] leading-[1.05] font-bold tracking-[-0.04em] sm:text-[48px]">
                {t("landing.ctaTitle")}
              </h2>
              <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-ink-500">
                {t("landing.ctaBody")}
              </p>
            </div>
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-5 font-mono text-xs font-semibold text-white focus-visible:ring-2"
            >
              {t("landing.openDocs")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-hair">
        <div className="mx-auto flex min-h-24 max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-6 sm:px-8">
          <KibitzLogo className="text-fg-2" />
          <span className="text-sm text-fg-3">{t("landing.footerNote")}</span>
          <Link
            href="/docs"
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-mono text-xs text-fg-2 transition-colors hover:text-fg focus-visible:ring-2"
          >
            {t("nav.docs")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </footer>
    </div>
  );
}

async function BulletList({ keys }: { keys: MessageKey[] }) {
  const t = await getT();
  return (
    <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {keys.map((key) => (
        <li key={key} className="flex gap-3 text-base leading-relaxed text-fg-2">
          <Check className="mt-1.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
          {t(key)}
        </li>
      ))}
    </ul>
  );
}
