import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  CheckList,
  MarketingPage,
  MarketingSection,
  NumberedFlow,
} from "@/components/marketing-page";
import { getLocale } from "@/lib/i18n";

const COPY = {
  en: {
    eyebrow: "Kibitz vs. Langfuse",
    title: "Compatible trace data. A different investigation lens.",
    lede:
      "Langfuse is a broad LLM engineering platform. Kibitz concentrates on the point where an agent run becomes too long for a span tree to explain: reconstructing the route, locating causal decisions, and attaching evidence.",
    alt: "Decision path splitting into recorded and alternative branches",
    caption:
      "Kibitz does not erase standard observations. It adds request, decision, evidence, and alternative relationships on top.",
    docs: "Read the migration guide",
    cta: "Compare on your own traces, not a feature checklist",
    ctaBody:
      "Export observations_v2 from Langfuse, import them into Kibitz, and inspect the same run through both products.",
    table: [
      ["Primary object", "Trace and observation", "Decision in a request journey"],
      ["Long-run navigation", "Nested observations and timing", "Request chapters, route map, backward loop arcs"],
      ["Failure explanation", "Scores, evaluators, metadata", "Observed values → rule → causal step → alternative"],
      ["Instrumentation", "SDKs and OpenTelemetry", "Python, TypeScript, OTLP/HTTP JSON, direct Run API"],
      ["Code agents", "Instrument the runtime", "Post-run and live-watch import for Claude Code and Codex"],
      ["Migration", "Export/API", "observations_v2 JSON, JSONL, and API response importer"],
      ["Evaluation", "Managed evaluation workflows", "Deterministic evidence, CLI-account or BYOK suggestions, human queues"],
      ["Deployment", "Full distributed platform", "File-readable local mode or stateless replicas on shared storage"],
    ],
    headers: ["Dimension", "Langfuse", "Kibitz"],
    migration: [
      {
        title: "Export",
        body: "Use the Langfuse v4 observations_v2 JSON/JSONL export or save an Observations API response.",
      },
      {
        title: "Import",
        body: "kibitz-langfuse-import groups rows by traceId and preserves hierarchy, usage, model, session, user, tags, release, and environment.",
      },
      {
        title: "Validate",
        body: "Compare observation counts, token usage, duration, model metadata, and parent relationships before removing existing instrumentation.",
      },
    ],
    choose: [
      "Choose Langfuse when you want one broad, mature LLM engineering suite.",
      "Choose Kibitz when long-running agent causality and local code-agent traces are the primary problem.",
      "Run both during migration; the importer is designed for coexistence rather than a flag day.",
    ],
    source: "Open Langfuse’s official Observations API documentation",
    fitTitle: "Fit matters more than parity",
  },
  ko: {
    eyebrow: "Kibitz와 Langfuse 비교",
    title: "호환되는 trace 데이터, 다른 조사 관점",
    lede:
      "Langfuse는 넓은 LLM engineering platform입니다. Kibitz는 Agent run이 span tree만으로 설명하기 어려울 만큼 길어지는 지점, 즉 경로 재구성·원인 decision·근거 연결에 집중합니다.",
    alt: "기록된 경로와 대안 경로로 갈라지는 decision path",
    caption:
      "Kibitz는 표준 observation을 지우지 않습니다. 그 위에 request, decision, evidence와 alternative 관계를 추가합니다.",
    docs: "이전 가이드 읽기",
    cta: "기능표가 아니라 실제 trace로 비교하세요",
    ctaBody:
      "Langfuse의 observations_v2를 export하고 Kibitz로 가져와 동일 run을 두 제품에서 직접 조사하세요.",
    table: [
      ["핵심 객체", "Trace와 observation", "Request journey 안의 decision"],
      ["장기 run 탐색", "중첩 observation과 timing", "Request 단락, route map, 되돌아가는 loop arc"],
      ["실패 설명", "Score, evaluator, metadata", "관측값 → 규칙 → 원인 단계 → 대안"],
      ["계측", "SDK와 OpenTelemetry", "Python, TypeScript, OTLP/HTTP JSON, 직접 Run API"],
      ["Code agent", "Runtime 계측", "Claude Code·Codex 사후 및 live-watch import"],
      ["이전", "Export/API", "observations_v2 JSON·JSONL·API 응답 importer"],
      ["평가", "관리형 평가 workflow", "결정론적 근거, CLI 계정·BYOK 제안, 사람 검토 queue"],
      ["배포", "완전한 분산 platform", "파일 가독 로컬 모드 또는 공유 storage 기반 stateless replica"],
    ],
    headers: ["기준", "Langfuse", "Kibitz"],
    migration: [
      {
        title: "Export",
        body: "Langfuse v4 observations_v2 JSON·JSONL export 또는 Observations API 응답을 저장합니다.",
      },
      {
        title: "Import",
        body: "kibitz-langfuse-import가 traceId로 row를 묶고 hierarchy, usage, model, session, user, tag, release와 environment를 보존합니다.",
      },
      {
        title: "검증",
        body: "기존 계측을 제거하기 전에 observation 수, token usage, duration, model metadata와 parent 관계를 대조합니다.",
      },
    ],
    choose: [
      "하나의 넓고 성숙한 LLM engineering suite가 필요하면 Langfuse를 선택하세요.",
      "장기 실행 Agent의 인과관계와 로컬 code-agent trace가 핵심 문제라면 Kibitz를 선택하세요.",
      "이전 중에는 둘을 함께 쓰세요. importer는 한 번에 갈아타기보다 공존을 위해 설계했습니다.",
    ],
    source: "Langfuse 공식 Observations API 문서 열기",
    fitTitle: "기능 수보다 문제 적합성이 중요합니다",
  },
};

export default async function CompareLangfusePage() {
  const copy = COPY[await getLocale()];
  return (
    <MarketingPage
      eyebrow={copy.eyebrow}
      title={copy.title}
      lede={copy.lede}
      image="/brand/decision-field.webp"
      imageAlt={copy.alt}
      caption={copy.caption}
      cta={copy.cta}
      ctaBody={copy.ctaBody}
      docsLabel={copy.docs}
    >
      <MarketingSection>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-ink-800">
              <tr>
                {copy.headers.map((header) => (
                  <th key={header} className="border-b border-line px-5 py-4 text-sm font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {copy.table.map(([dimension, langfuse, kibitz]) => (
                <tr key={dimension} className="border-b border-hair last:border-0">
                  <th className="px-5 py-5 text-base font-semibold">{dimension}</th>
                  <td className="px-5 py-5 text-base leading-relaxed text-fg-2">{langfuse}</td>
                  <td className="border-l border-hair px-5 py-5 text-base leading-relaxed">
                    {kibitz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link
          href="https://langfuse.com/docs/api-and-data-platform/features/observations-api"
          className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-fg focus-visible:ring-2"
        >
          {copy.source}
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </MarketingSection>

      <MarketingSection tone="muted">
        <NumberedFlow items={copy.migration} />
      </MarketingSection>

      <MarketingSection>
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <h2 className="max-w-[12ch] text-[36px] leading-[1.08] font-bold tracking-[-0.04em]">
            {copy.fitTitle}
          </h2>
          <CheckList items={copy.choose} />
        </div>
      </MarketingSection>
    </MarketingPage>
  );
}
