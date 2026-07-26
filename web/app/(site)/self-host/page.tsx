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
    eyebrow: "Self-host",
    title: "Your agents, prompts, and traces stay in your boundary",
    lede:
      "Run Kibitz on a laptop, an internal server, or multiple stateless web replicas backed by a shared RWX volume. Trace and evaluation resources are stored outside the image and written atomically.",
    alt: "Private trace archive receiving authenticated agent data and replicating to a second node",
    caption:
      "Ingestion, resource storage, and the application remain separable. Replace a web container without replacing its trace history.",
    docs: "Read self-hosting docs",
    cta: "Deploy the smallest topology that matches the workload",
    ctaBody:
      "Start with Docker Compose. Move the same data directories to a shared persistent volume when you add replicas.",
    modes: [
      {
        title: "Local",
        body: "One process and human-readable JSON files. Best for evaluating private coding-agent sessions.",
      },
      {
        title: "Persistent server",
        body: "Docker Compose keeps traces and prompt/evaluation resources in named volumes across container replacement.",
      },
      {
        title: "Multiple replicas",
        body: "Web instances are stateless. Mount the same RWX trace/resource directories; atomic rename prevents partial JSON reads.",
      },
    ],
    securityTitle: "Project-scoped access without handing API keys to the browser",
    securityBody:
      "External collectors use read or ingest roles. A scoped token can force every incoming run into one project and restrict every API result to the same project.",
    security: [
      "Separate read, ingest, and admin roles",
      "Project is derived from the token rather than trusted request data",
      "Prompt recording remains opt-in in the LangChain callback",
      "BYOK keys stay server-side; optional Claude Code/Codex auth remains inside the installed CLI",
      "OTLP and direct Run ingestion share the same authorization path",
    ],
    flow: [
      {
        title: "Collector",
        body: "Python, TypeScript, OTLP, Langfuse, Claude Code, Codex, and direct HTTP enter through authenticated routes.",
      },
      {
        title: "Store",
        body: "Each trace is an idempotent file. Temporary write plus same-directory rename makes every visible document complete.",
      },
      {
        title: "Investigate",
        body: "Any stateless web replica reads the same trace and resource directories and derives sessions, scores, and failure clusters.",
      },
    ],
    config: "Project token configuration",
    compose: "Docker Compose",
  },
  ko: {
    eyebrow: "셀프호스팅",
    title: "Agent, prompt와 trace를 조직의 경계 안에 둡니다",
    lede:
      "노트북, 내부 서버 또는 공유 RWX volume을 쓰는 여러 stateless web replica에서 Kibitz를 실행하세요. Trace와 평가 resource는 이미지 밖에 저장되고 원자적으로 기록됩니다.",
    alt: "인증된 Agent 데이터를 받고 두 번째 노드로 연결되는 private trace archive",
    caption:
      "수집, resource 저장과 애플리케이션은 분리됩니다. web container를 교체해도 trace history는 교체되지 않습니다.",
    docs: "셀프호스팅 문서 읽기",
    cta: "워크로드에 맞는 가장 작은 topology로 시작하세요",
    ctaBody:
      "Docker Compose로 시작하고 replica가 필요해지면 같은 데이터 디렉터리를 공유 persistent volume으로 옮기면 됩니다.",
    modes: [
      {
        title: "로컬",
        body: "하나의 process와 사람이 읽을 수 있는 JSON 파일. private coding-agent session을 평가하기에 적합합니다.",
      },
      {
        title: "영속 서버",
        body: "Docker Compose named volume에 trace와 prompt·evaluation resource를 보관해 container 교체 뒤에도 유지합니다.",
      },
      {
        title: "다중 replica",
        body: "web instance는 stateless입니다. 동일 RWX trace·resource 디렉터리를 mount하며 atomic rename으로 부분 JSON 노출을 막습니다.",
      },
    ],
    securityTitle: "브라우저에 API key를 주지 않는 project-scoped 접근",
    securityBody:
      "외부 collector는 read 또는 ingest role을 사용합니다. scoped token은 들어오는 모든 run을 한 project로 고정하고 API 결과도 같은 project로 제한합니다.",
    security: [
      "read, ingest, admin 역할 분리",
      "요청 본문을 믿지 않고 token에서 project 결정",
      "LangChain callback의 prompt 기록은 opt-in",
      "BYOK key는 server에, 선택적 Claude Code·Codex 인증은 설치된 CLI 안에만 남음",
      "OTLP와 직접 Run 수집이 동일한 인증 경로 사용",
    ],
    flow: [
      {
        title: "Collector",
        body: "Python, TypeScript, OTLP, Langfuse, Claude Code, Codex와 직접 HTTP가 인증된 route로 들어옵니다.",
      },
      {
        title: "Store",
        body: "각 trace는 idempotent file입니다. 임시 쓰기 후 같은 디렉터리 rename으로 언제나 완전한 문서만 노출합니다.",
      },
      {
        title: "Investigate",
        body: "어느 stateless web replica든 동일 trace·resource directory를 읽고 session, score와 failure cluster를 계산합니다.",
      },
    ],
    config: "Project token 설정",
    compose: "Docker Compose",
  },
};

export default async function SelfHostPage() {
  const copy = COPY[await getLocale()];
  return (
    <MarketingPage
      eyebrow={copy.eyebrow}
      title={copy.title}
      lede={copy.lede}
      image="/brand/self-hosted-trace-archive.webp"
      imageAlt={copy.alt}
      caption={copy.caption}
      cta={copy.cta}
      ctaBody={copy.ctaBody}
      docsLabel={copy.docs}
    >
      <MarketingSection>
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-6">
          {copy.modes.map((mode, index) => (
            <article
              key={mode.title}
              className={`bg-ink-900 p-6 sm:p-8 ${
                index === 0
                  ? "md:col-span-2"
                  : index === 1
                    ? "md:col-span-4"
                    : "md:col-span-6"
              }`}
            >
              <p className="font-mono text-xs text-brand">0{index + 1}</p>
              <h2 className="mt-8 text-2xl font-semibold">{mode.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-fg-2">{mode.body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection tone="muted">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="max-w-[16ch] text-[36px] leading-[1.08] font-bold tracking-[-0.04em]">
              {copy.securityTitle}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-fg-2">{copy.securityBody}</p>
          </div>
          <CheckList items={copy.security} />
        </div>
      </MarketingSection>

      <MarketingSection>
        <NumberedFlow items={copy.flow} />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <CodeBlock
            filename={copy.config}
            code={`KIBITZ_PROJECT_TOKENS={
  "collector-token": {"project":"agent-prod","role":"ingest"},
  "reader-token": {"project":"agent-prod","role":"read"}
}`}
          />
          <CodeBlock
            filename={copy.compose}
            code={`KIBITZ_INGEST_TOKEN=replace-me
KIBITZ_READ_TOKEN=replace-me
docker compose up -d

# Multiple replicas: mount the same RWX paths
KIBITZ_DATA_DIR=/data/traces
KIBITZ_RESOURCE_DIR=/data/resources`}
          />
        </div>
      </MarketingSection>
    </MarketingPage>
  );
}
