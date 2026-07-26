import Link from "next/link";
import { ArrowRight, GitBranch, ScanSearch, TimerReset } from "lucide-react";
import {
  CheckList,
  MarketingPage,
  MarketingSection,
  NumberedFlow,
} from "@/components/marketing-page";
import { getLocale } from "@/lib/i18n";

const COPY = {
  en: {
    eyebrow: "Product",
    title: "An investigation surface for agent-length work",
    lede:
      "Kibitz keeps standard spans, then adds the objects a long-running agent actually needs: request boundaries, decision paths, context movement, evidence, and alternatives.",
    alt: "Physical decision topology with grouped observations and backward loop arcs",
    caption:
      "A long run is not flattened into a list. Request chapters, causal steps, return loops, and alternatives stay connected.",
    whyTitle: "The unit of analysis is a decision—not a colored span",
    whyBody:
      "A span tells you that search() ran. A decision tells you which request it served, what the agent knew, what came back, whether state advanced, and what cheaper path was available.",
    checks: [
      "Collapse hundreds of observations at real user-request boundaries",
      "Preserve parent/child spans, timing, token usage, cost, model, session, user, and tags",
      "Place a finding on the observation that triggered it—not in a separate report",
      "Show observed values, the rule that matched, and the counterfactual action together",
      "Keep deterministic evidence and optional CLI-account or BYOK suggestions visually separate",
    ],
    flow: [
      {
        title: "Capture",
        body: "Instrument Python or TypeScript, receive OTLP/HTTP JSON, import code-agent sessions, or migrate Langfuse observations.",
      },
      {
        title: "Reconstruct",
        body: "Turn raw observations into request groups and an ordered path without discarding the original execution tree.",
      },
      {
        title: "Diagnose",
        body: "Detect repeated calls, tool cycles, empty-result loops, cache breaks, and unsupported numeric claims from recorded values.",
      },
      {
        title: "Improve",
        body: "Send a bounded, inspectable brief to your chosen model for grounded remediation suggestions, or route the run to human review.",
      },
    ],
    lenses: [
      ["Journey", "Scan the work by request chapter instead of scrolling a flat span table.", GitBranch],
      ["Evidence", "Open the exact inputs and comparisons behind every deterministic finding.", ScanSearch],
      ["Counterfactual", "Estimate which turns, milliseconds, and tokens a corrected path would avoid.", TimerReset],
    ] as const,
    cta: "Bring one difficult run. Keep every reason attached.",
    ctaBody:
      "The quickstart imports a real coding-agent session or instruments an agent you own, then opens the resulting trace.",
    docs: "Read the quickstart",
    inspect: "Inspect a live trace",
  },
  ko: {
    eyebrow: "제품",
    title: "Agent 길이의 작업을 조사하는 화면",
    lede:
      "Kibitz는 표준 span을 보존하면서 장기 실행 Agent에 필요한 request 경계, decision path, context 이동, 근거와 대안을 1급 객체로 추가합니다.",
    alt: "관측 묶음과 되돌아가는 반복 경로를 표현한 물리적 decision topology",
    caption:
      "긴 run을 평평한 목록으로 만들지 않습니다. 요청 단락, 원인 단계, 반복 경로와 대안이 연결된 상태로 남습니다.",
    whyTitle: "분석의 단위는 색칠된 span이 아니라 결정입니다",
    whyBody:
      "span은 search()가 실행됐음을 말합니다. decision은 어떤 요청을 위한 호출이었는지, Agent가 무엇을 알고 있었는지, 상태가 전진했는지, 더 나은 경로가 무엇이었는지를 함께 말합니다.",
    checks: [
      "수백 개 observation을 실제 사용자 request 경계로 접기",
      "부모·자식 span, 시간, token, 비용, 모델, session, user, tag 보존",
      "별도 리포트가 아니라 원인이 된 observation에 finding 배치",
      "관측값, 일치한 규칙, counterfactual 행동을 한 화면에 연결",
      "결정론적 근거와 선택적 CLI 계정·BYOK 제안을 시각적으로 분리",
    ],
    flow: [
      {
        title: "수집",
        body: "Python·TypeScript를 계측하고, OTLP/HTTP JSON을 받거나 code-agent session과 Langfuse observation을 가져옵니다.",
      },
      {
        title: "재구성",
        body: "원본 실행 트리를 버리지 않고 observation을 request group과 순서 있는 경로로 바꿉니다.",
      },
      {
        title: "진단",
        body: "반복 호출, tool cycle, 빈 결과 반복, cache break, 출처 없는 숫자를 기록된 값으로 찾습니다.",
      },
      {
        title: "개선",
        body: "범위와 내용이 보이는 brief를 선택한 모델에 보내 개선안을 얻거나 사람 검토 queue로 보냅니다.",
      },
    ],
    lenses: [
      ["Journey", "평평한 span 표를 스크롤하는 대신 사용자 요청 단락으로 작업을 훑습니다.", GitBranch],
      ["Evidence", "각 결정론적 finding을 만든 정확한 입력값과 비교를 엽니다.", ScanSearch],
      ["Counterfactual", "수정된 경로가 줄일 turn, 시간과 token을 계산합니다.", TimerReset],
    ] as const,
    cta: "가장 어려웠던 run 하나를 가져오세요",
    ctaBody:
      "빠른 시작은 실제 coding-agent session을 가져오거나 직접 만든 Agent를 계측한 뒤, 생성된 trace를 여는 데서 끝납니다.",
    docs: "빠른 시작 읽기",
    inspect: "실제 trace 보기",
  },
};

export default async function ProductPage() {
  const copy = COPY[await getLocale()];
  return (
    <MarketingPage
      eyebrow={copy.eyebrow}
      title={copy.title}
      lede={copy.lede}
      image="/brand/agent-trace-topology.webp"
      imageAlt={copy.alt}
      caption={copy.caption}
      cta={copy.cta}
      ctaBody={copy.ctaBody}
      docsLabel={copy.docs}
    >
      <MarketingSection>
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <h2 className="max-w-[14ch] text-[36px] leading-[1.08] font-bold tracking-[-0.04em]">
              {copy.whyTitle}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-fg-2">{copy.whyBody}</p>
            <Link
              href="/traces"
              className="mt-7 inline-flex min-h-11 items-center gap-2 font-mono text-xs text-brand hover:underline focus-visible:ring-2"
            >
              {copy.inspect}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <CheckList items={copy.checks} />
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <NumberedFlow items={copy.flow} />
      </MarketingSection>

      <MarketingSection>
        <div className="grid gap-4 md:grid-cols-6">
          {copy.lenses.map(([title, body, Icon], index) => (
            <article
              key={title}
              className={`rounded-xl border border-line bg-ink-800 p-6 ${
                index === 0 ? "md:col-span-3 md:row-span-2" : "md:col-span-3"
              }`}
            >
              <Icon className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="mt-10 text-2xl font-semibold">{title}</h2>
              <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-fg-2">{body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>
    </MarketingPage>
  );
}
