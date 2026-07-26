import { Braces, FileInput, Radio, Terminal, Waypoints } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import {
  CheckList,
  MarketingPage,
  MarketingSection,
  NumberedFlow,
} from "@/components/marketing-page";
import { getLocale } from "@/lib/i18n";

const COPY = {
  en: {
    eyebrow: "Integrations",
    title: "One trace model, six ways in",
    lede:
      "Start with the runtime you already have. Native SDKs add request semantics; standards and importers let you evaluate Kibitz before changing production code.",
    alt: "Multiple agent data formats passing through one precise ingestion gateway",
    caption:
      "Different inputs converge on the same Run shape, so investigation does not change when the framework does.",
    docs: "Open integration docs",
    cta: "Connect without rewriting the agent",
    ctaBody:
      "Use a post-run importer first, then move to native or OTLP instrumentation when you want continuous traces.",
    methods: [
      {
        title: "Python SDK",
        body: "Sync and async-safe trace context, request boundaries, explicit spans, @tool, and LangChain/LangGraph callbacks.",
        icon: Braces,
      },
      {
        title: "TypeScript SDK",
        body: "AsyncLocalStorage isolation, instrument() wrappers, request groups, usage, cost, sessions, users, and tags.",
        icon: Braces,
      },
      {
        title: "OpenTelemetry",
        body: "Receive standard OTLP/HTTP JSON at /api/otel/v1/traces and retain parent-span hierarchy and GenAI attributes.",
        icon: Radio,
      },
      {
        title: "Claude Code & Codex",
        body: "Import local JSONL once or keep --watch running. For suggestions, delegate to the account already signed in through either installed CLI.",
        icon: Terminal,
      },
      {
        title: "Langfuse migration",
        body: "Read v4 observations_v2 JSON, JSONL, or Observations API responses and rebuild traces by traceId.",
        icon: FileInput,
      },
      {
        title: "Direct HTTP",
        body: "POST one completed Kibitz Run or an array with project-scoped ingest tokens.",
        icon: Waypoints,
      },
    ],
    flow: [
      {
        title: "Evaluate",
        body: "Import recent Claude Code, Codex, or Langfuse history. Production instrumentation stays untouched.",
      },
      {
        title: "Instrument",
        body: "Add Python or TypeScript request boundaries, or point an OTLP/HTTP JSON exporter at Kibitz.",
      },
      {
        title: "Operate",
        body: "Use project-scoped read and ingest tokens, persistent resources, and a shared trace volume.",
      },
    ],
    python: "Python",
    typescript: "TypeScript",
    otel: "OpenTelemetry",
    langfuse: "Langfuse export",
  },
  ko: {
    eyebrow: "연동",
    title: "하나의 trace 모델, 여섯 가지 수집 경로",
    lede:
      "이미 쓰고 있는 runtime에서 시작하세요. Native SDK는 request 의미를 더하고, 표준 수집과 importer는 production 코드를 바꾸기 전에 Kibitz를 평가하게 해줍니다.",
    alt: "여러 Agent 데이터 형식이 하나의 정밀한 ingestion gateway를 통과하는 모습",
    caption:
      "입력 형식이 달라도 같은 Run 형태로 모이기 때문에 framework가 바뀌어도 조사 경험은 달라지지 않습니다.",
    docs: "연동 문서 열기",
    cta: "Agent를 다시 만들지 않고 연결하세요",
    ctaBody:
      "먼저 사후 importer로 확인하고, 연속 추적이 필요해지면 native SDK나 OTLP 계측으로 옮기세요.",
    methods: [
      {
        title: "Python SDK",
        body: "sync·async 안전 trace context, request 경계, 명시적 span, @tool, LangChain·LangGraph callback을 제공합니다.",
        icon: Braces,
      },
      {
        title: "TypeScript SDK",
        body: "AsyncLocalStorage 격리, instrument() wrapper, request group, usage, 비용, session, user와 tag를 기록합니다.",
        icon: Braces,
      },
      {
        title: "OpenTelemetry",
        body: "/api/otel/v1/traces에서 표준 OTLP/HTTP JSON을 받고 parent span 계층과 GenAI attribute를 보존합니다.",
        icon: Radio,
      },
      {
        title: "Claude Code & Codex",
        body: "로컬 JSONL을 한 번 가져오거나 --watch로 자동 갱신합니다. 개선 제안은 설치된 CLI에 로그인된 계정으로 위임할 수 있습니다.",
        icon: Terminal,
      },
      {
        title: "Langfuse 이전",
        body: "v4 observations_v2 JSON·JSONL·Observations API 응답을 읽고 traceId별 run을 재구성합니다.",
        icon: FileInput,
      },
      {
        title: "직접 HTTP",
        body: "완성된 Kibitz Run 하나나 배열을 project-scoped ingest token으로 전송합니다.",
        icon: Waypoints,
      },
    ],
    flow: [
      {
        title: "평가",
        body: "최근 Claude Code, Codex 또는 Langfuse 기록을 가져옵니다. production 계측은 건드리지 않습니다.",
      },
      {
        title: "계측",
        body: "Python·TypeScript에 request 경계를 추가하거나 OTLP/HTTP JSON exporter를 Kibitz로 보냅니다.",
      },
      {
        title: "운영",
        body: "project별 read·ingest token, 영속 resource와 공유 trace volume을 사용합니다.",
      },
    ],
    python: "Python",
    typescript: "TypeScript",
    otel: "OpenTelemetry",
    langfuse: "Langfuse export",
  },
};

export default async function IntegrationsPage() {
  const copy = COPY[await getLocale()];
  return (
    <MarketingPage
      eyebrow={copy.eyebrow}
      title={copy.title}
      lede={copy.lede}
      image="/brand/agent-ingestion-gateway.webp"
      imageAlt={copy.alt}
      caption={copy.caption}
      cta={copy.cta}
      ctaBody={copy.ctaBody}
      docsLabel={copy.docs}
    >
      <MarketingSection>
        <div className="grid gap-4 md:grid-cols-6">
          {copy.methods.map(({ title, body, icon: Icon }, index) => (
            <article
              key={title}
              className={`rounded-xl border border-line bg-ink-800 p-6 ${
                index < 2 ? "md:col-span-3" : "md:col-span-2"
              }`}
            >
              <Icon className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="mt-8 text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-base leading-relaxed text-fg-2">{body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock
            filename={copy.python}
            code={`from kibitz_sdk import trace, tool

@tool
async def search(query: str):
    return await index.search(query)

async def main():
    with trace("research", agent="analyst") as run:
        with run.request("Compare the proposals"):
            rows = await search("latest proposals")
            run.answer(summarize(rows))`}
          />
          <CodeBlock
            filename={copy.typescript}
            code={`import { instrument, trace } from "@kibitz/sdk";

const search = instrument("search", index.search);

await trace("research", { agent: "analyst" }, async (run) => {
  await run.request("Compare the proposals", async () => {
    const rows = await search("latest proposals");
    run.answer(summarize(rows));
  });
});`}
          />
          <CodeBlock
            filename={copy.otel}
            code={`OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=https://kibitz.example/api/otel
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20$KIBITZ_INGEST_TOKEN`}
          />
          <CodeBlock
            filename={copy.langfuse}
            code={`uv run kibitz-langfuse-import observations_v2.jsonl \\
  --out ../web/.kibitz/traces/langfuse.json`}
          />
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <CheckList
            items={[
              "trace / session / user / project",
              "model / usage / cost / latency",
              "parent span / request boundary",
              "tool input / output / status",
            ]}
          />
          <NumberedFlow items={copy.flow} />
        </div>
      </MarketingSection>
    </MarketingPage>
  );
}
