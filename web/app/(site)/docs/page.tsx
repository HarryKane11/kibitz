import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Check,
  CircleAlert,
  Code2,
  FileJson,
  LockKeyhole,
  Server,
  Terminal,
} from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/lib/i18n";

const TOC = [
  ["quickstart", "quickstart"],
  ["choose", "choosePath"],
  ["python", "pythonAgent"],
  ["code-agents", "codeAgent"],
  ["http", "http"],
  ["concepts", "concepts"],
  ["privacy", "privacy"],
  ["operations", "operations"],
  ["limits", "limits"],
] as const;

export default async function DocsPage() {
  const t = await getT();

  return (
    <div className="min-h-screen bg-ink-900">
      <SiteHeader />

      <main id="main" className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="border-b border-hair pb-12">
          <p className="font-mono text-xs tracking-[0.08em] text-brand uppercase">
            {t("docs.eyebrow")}
          </p>
          <h1 className="mt-5 max-w-[15ch] text-[44px] leading-[1.02] font-bold tracking-[-0.045em] text-balance sm:text-[64px]">
            {t("docs.title")}
          </h1>
          <p className="mt-6 max-w-[70ch] text-lg leading-relaxed text-fg-2">
            {t("docs.lede")}
          </p>
        </div>

        <div className="grid gap-12 pt-12 lg:grid-cols-[220px_minmax(0,760px)] lg:justify-between">
          <aside className="hidden lg:block">
            <nav className="sticky top-24" aria-label={t("docs.onThisPage")}>
              <p className="mb-3 font-mono text-xs text-fg-3 uppercase">
                {t("docs.onThisPage")}
              </p>
              <ul className="border-l border-line">
                {TOC.map(([id, key]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="block min-h-10 border-l border-transparent px-4 py-2 text-sm text-fg-2 transition-colors hover:border-brand hover:text-fg focus-visible:ring-2"
                    >
                      {t(`docs.${key}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="min-w-0 space-y-20">
            <section id="quickstart" className="scroll-mt-24">
              <SectionHeading title={t("docs.quickTitle")} body={t("docs.quickBody")} />
              <div className="mt-8 space-y-6">
                <DocStep label={t("docs.installLabel")}>
                  <CodeBlock
                    filename="terminal"
                    code={`git clone <your-kibitz-repository>
cd kibitz
pnpm --dir web install
pnpm --dir web dev`}
                  />
                </DocStep>
                <DocStep label={t("docs.importLabel")}>
                  <CodeBlock
                    filename="terminal"
                    code={`cd agent
uv sync
uv run python -m kibitz_ingest.cli --source all --limit 8`}
                  />
                </DocStep>
                <DocStep label={t("docs.verifyLabel")}>
                  <p className="text-base leading-relaxed text-fg-2">{t("docs.verifyBody")}</p>
                  <Link
                    href="/traces"
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 font-mono text-xs font-semibold text-fg transition-colors hover:border-line-3 focus-visible:ring-2"
                  >
                    /traces
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </DocStep>
              </div>
            </section>

            <section id="choose" className="scroll-mt-24">
              <SectionHeading title={t("docs.chooseTitle")} body={t("docs.chooseBody")} />
              <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
                <PathCard
                  icon={Braces}
                  title={t("docs.pythonAgent")}
                  body={t("docs.pythonBody")}
                  href="#python"
                />
                <PathCard
                  icon={Terminal}
                  title={t("docs.codeAgent")}
                  body={t("docs.codeBody")}
                  href="#code-agents"
                />
                <PathCard
                  icon={FileJson}
                  title={t("docs.http")}
                  body={t("docs.httpPathBody")}
                  href="#http"
                />
              </div>
            </section>

            <section id="python" className="scroll-mt-24">
              <SectionHeading title={t("docs.customTitle")} body={t("docs.customBody")} />
              <div className="mt-8">
                <CodeBlock
                  filename="agent.py"
                  code={`from kibitz_sdk import trace, tool

@tool
def search(query: str) -> list[dict]:
    return db.search(query)

with trace(
    "monthly-report",
    agent="sales-reporter",
    model="claude-opus",
    session_id="session-42",
    user_id="user-7",
    tags=["production"],
) as run:
    with run.request("Summarize Q3 revenue"):
        rows = search("revenue 2026 Q3")
        run.answer(summarize(rows), input_tokens=1200, output_tokens=180)`}
                />
              </div>
              <div className="mt-8 divide-y divide-line border-y border-line">
                <Definition title={t("docs.requestTitle")} body={t("docs.requestBody")} />
                <Definition title={t("docs.spanTitle")} body={t("docs.spanBody")} />
                <Definition title={t("docs.langchainTitle")} body={t("docs.langchainBody")} />
              </div>
            </section>

            <section id="code-agents" className="scroll-mt-24">
              <SectionHeading title={t("docs.codingTitle")} body={t("docs.codingBody")} />
              <div className="mt-8">
                <CodeBlock
                  filename="terminal"
                  code={`# Both supported adapters
uv run python -m kibitz_ingest.cli --source all --limit 8

# One source, a custom root, and a larger cap
uv run python -m kibitz_ingest.cli \\
  --source codex \\
  --root ~/.codex/sessions \\
  --max-turns 4000`}
                />
              </div>
              <div className="mt-6 flex gap-3 border-l-2 border-brand pl-5">
                <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <h3 className="font-semibold">{t("docs.supportTitle")}</h3>
                  <p className="mt-1 text-base leading-relaxed text-fg-2">
                    {t("docs.supportBody")}
                  </p>
                </div>
              </div>
            </section>

            <section id="http" className="scroll-mt-24">
              <SectionHeading title={t("docs.httpTitle")} body={t("docs.httpBody")} />
              <div className="mt-8">
                <CodeBlock
                  filename="terminal"
                  code={`export KIBITZ_INGEST_TOKEN="replace-me"

curl http://localhost:3000/api/traces \\
  -H "Authorization: Bearer $KIBITZ_INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data-binary @trace.json`}
                />
              </div>
            </section>

            <section id="concepts" className="scroll-mt-24">
              <SectionHeading title={t("docs.modelTitle")} body={t("docs.modelBody")} />
              <ol className="mt-8 border-t border-line">
                {(
                  [
                    ["01", "traceNode"],
                    ["02", "requestNode"],
                    ["03", "observationNode"],
                    ["04", "verdictNode"],
                  ] as const
                ).map(([n, key]) => (
                  <li
                    key={key}
                    className="grid gap-3 border-b border-line py-5 sm:grid-cols-[48px_1fr]"
                  >
                    <span className="font-mono text-xs text-brand">{n}</span>
                    <span className="text-base font-medium">{t(`docs.${key}`)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section id="privacy" className="scroll-mt-24">
              <SectionHeading title={t("docs.privacyTitle")} body={t("docs.privacyBody")} />
              <CheckList
                items={[t("docs.privacy1"), t("docs.privacy2"), t("docs.privacy3")]}
                icon={LockKeyhole}
              />
            </section>

            <section id="operations" className="scroll-mt-24">
              <SectionHeading
                title={t("docs.operationsTitle")}
                body={t("docs.operationsBody")}
              />
              <div className="mt-8">
                <CodeBlock
                  filename="terminal"
                  code={`cp .env.example .env
# Set KIBITZ_INGEST_TOKEN and KIBITZ_READ_TOKEN in .env
docker compose up -d

# Runtime traces persist in the kibitz-traces volume
docker compose ps`}
                />
              </div>
            </section>

            <section id="limits" className="scroll-mt-24">
              <SectionHeading title={t("docs.limitsTitle")} />
              <CheckList
                items={[
                  t("docs.limit1"),
                  t("docs.limit2"),
                  t("docs.limit3"),
                  t("docs.limit4"),
                  t("docs.limit5"),
                ]}
                icon={CircleAlert}
              />
            </section>

            <section className="rounded-xl border border-line bg-ink-800 p-6 sm:p-8">
              <Server className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="mt-5 text-2xl font-semibold">{t("docs.sourceDocs")}</h2>
              <p className="mt-3 text-base leading-relaxed text-fg-2">
                {t("docs.sourceDocsBody")}
              </p>
            </section>
          </article>
        </div>
      </main>
    </div>
  );
}

function SectionHeading({ title, body }: { title: string; body?: string }) {
  return (
    <header>
      <h2 className="text-[30px] leading-[1.12] font-bold tracking-[-0.035em] text-balance">
        {title}
      </h2>
      {body && <p className="mt-4 max-w-[68ch] text-base leading-relaxed text-fg-2">{body}</p>}
    </header>
  );
}

function DocStep({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
      <h3 className="text-sm font-semibold text-fg">{label}</h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PathCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: typeof Braces;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group bg-ink-800 p-5 transition-colors hover:bg-ink-700 focus-visible:ring-2"
    >
      <Icon className="h-5 w-5 text-brand" aria-hidden />
      <h3 className="mt-6 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-2">{body}</p>
      <ArrowRight className="mt-5 h-4 w-4 text-fg-3 group-hover:text-fg" aria-hidden />
    </a>
  );
}

function Definition({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-2 py-5 sm:grid-cols-[190px_1fr]">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-base leading-relaxed text-fg-2">{body}</p>
    </div>
  );
}

function CheckList({
  items,
  icon: Icon,
}: {
  items: string[];
  icon: typeof Check;
}) {
  return (
    <ul className="mt-8 space-y-3">
      {items.map((item) => (
        <li
          key={item}
          className="flex min-w-0 gap-3 rounded-lg border border-line bg-ink-800 p-4"
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span className="min-w-0 break-words text-base leading-relaxed text-fg-2">{item}</span>
        </li>
      ))}
    </ul>
  );
}
