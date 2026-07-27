"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, LogIn, Sparkles, TriangleAlert } from "lucide-react";
import {
  analyzeTrace,
  forgetAnalysis,
  listAnalyses,
  pollCodeAgentLogin,
  refreshProviders,
  startCodeAgentLogin,
} from "@/lib/analysis/actions";
import type {
  AnalyzeOutcome,
  ProviderStatus,
  SavedAnalysis,
} from "@/lib/analysis/catalog";
import { useT } from "@/components/i18n-provider";
import { Card } from "@/components/page";
import { cn } from "@/lib/utils";

/**
 * BYOK 분석 패널.
 *
 * 이 화면의 나머지 전부는 계산된 값이다. **이 패널만 모델이 쓴 글이고**, 그 사실을
 * 숨기지 않는다 — 라벨을 붙이고, 무엇을 보냈는지 보여주고, 모델이 인용한 관측
 * 번호를 브리프와 대조해 지어낸 인용을 표시한다. 판정과 같은 무게로 그리면
 * "LLM 판정을 쓰지 않는다"는 이 제품의 주장이 그 자리에서 거짓이 된다.
 *
 * 키를 서버에 두면 브라우저는 키를 보지 않는다. 붙여 넣은 키는 이 요청 하나에만
 * 쓰이고 저장되지 않는다 — 그래서 localStorage 에도 넣지 않는다.
 */
export function AnalysisPanel({
  runId,
  providers: initialProviders,
  briefs,
  saved: initialSaved = [],
}: {
  runId: string;
  providers: ProviderStatus[];
  briefs: { full: string; redacted: string };
  /** 저장된 분석. 새로고침해도 남아 있어야 한다. */
  saved?: SavedAnalysis[];
}) {
  const t = useT();
  const [providers, setProviders] = useState(initialProviders);
  const [provider, setProvider] = useState(
    () => (initialProviders.find((p) => p.configured) ?? initialProviders[0]).id as string,
  );
  const [models, setModels] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProviders.map((p) => [p.id, p.defaultModel])),
  );
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [redact, setRedact] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  /** 실패는 화면에만 남는다 — 저장할 가치가 없다. 성공은 디스크에서 온다. */
  const [failure, setFailure] = useState<Extract<AnalyzeOutcome, { ok: false }> | null>(null);
  const [saved, setSaved] = useState<SavedAnalysis[]>(initialSaved);
  const [loginState, setLoginState] = useState<{
    provider: string;
    pending: boolean;
    output: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const active = providers.find((p) => p.id === provider)!;
  const model = models[provider] ?? "";
  const key = keys[provider] ?? "";
  const brief = redact ? briefs.redacted : briefs.full;
  // 공개 배포에서는 붙여 넣기가 막혀 있다 — 입력란을 띄우지 않고 이유를 말한다.
  const needsPastedKey = active.needsKey && !active.configured && !active.keysBlocked;
  const authenticated =
    active.authMode === "cli-session"
      ? active.configured
      : active.keysBlocked
        ? false
        : !needsPastedKey || key.trim().length > 0;
  const ready =
    (!active.requiresModel || model.trim().length > 0) &&
    authenticated;

  const pick = (id: string) => {
    setProvider(id);
    setFailure(null);
    // ollama 는 로컬이라 "설정됨"이 곧 "떠 있음"이다. 고를 때 실제로 물어본다 —
    // 페이지를 그릴 때마다 물으면 떠 있지 않은 ollama 를 매번 기다리게 된다.
    if (id === "ollama" && providers.find((p) => p.id === id)?.models === undefined) {
      startTransition(async () => {
        const fresh = await refreshProviders();
        setProviders(fresh);
        const local = fresh.find((p) => p.id === "ollama");
        if (local?.defaultModel) {
          setModels((m) => (m.ollama ? m : { ...m, ollama: local.defaultModel }));
        }
      });
    }
  };

  const run = () => {
    startTransition(async () => {
      const outcome = await analyzeTrace({
        runId,
        provider,
        model: model.trim(),
        apiKey: needsPastedKey ? key.trim() : undefined,
        redactArgs: redact,
      });
      if (outcome.ok) {
        setFailure(null);
        // 저장된 목록을 디스크에서 다시 읽는다. 응답을 그대로 화면에 얹으면
        // 저장된 것과 보이는 것이 어긋날 수 있고, 그 차이는 새로고침 때 드러난다.
        setSaved(await listAnalyses(runId));
      } else {
        setFailure(outcome);
      }
    });
  };

  const login = async () => {
    setLoginState({ provider, pending: true, output: "" });
    const started = await startCodeAgentLogin(provider);
    if (!started.ok) {
      setLoginState({
        provider,
        pending: false,
        output: started.error || started.command,
      });
      return;
    }
    if (!started.sessionId) {
      setProviders(await refreshProviders());
      setLoginState({ provider, pending: false, output: t("analysis.cliAlreadyLoggedIn") });
      return;
    }
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const progress = await pollCodeAgentLogin(started.sessionId);
      setLoginState({ provider, pending: !progress.done, output: progress.output });
      if (progress.done) {
        setProviders(await refreshProviders());
        break;
      }
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("analysis.title")}</h2>
        <p className="max-w-2xl text-sm text-fg-2">{t("analysis.subtitle")}</p>
      </div>

      <Card>
        {/* 제공자 */}
        <p className="mb-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t("analysis.provider")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              aria-pressed={provider === p.id}
              title={p.unavailable ?? (p.configured ? undefined : t("analysis.needsKeyShort"))}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-100 active:scale-[0.97]",
                provider === p.id
                  ? "border-fg bg-fg text-ink-900"
                  : "border-line text-fg-2 hover:border-line-3 hover:text-fg",
              )}
            >
              {p.label}
              {/* 설정됨 = 채워진 점. 새 색을 만들지 않는다 — 팔레트는 셋뿐이고
                  sky 는 선택 전용이다. 밝기 차이로 말한다. */}
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-current",
                  !p.configured && "opacity-30",
                )}
              />
            </button>
          ))}
        </div>

        {active.unavailable && (
          <p className="mt-2 font-mono text-[11px] text-warn">{active.unavailable}</p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* 모델 */}
          <label className="block">
            <span className="mb-1 block text-xs text-fg-3">{t("analysis.model")}</span>
            <input
              value={model}
              onChange={(e) => setModels((m) => ({ ...m, [provider]: e.target.value }))}
              list={active.models?.length ? "kibitz-local-models" : undefined}
              spellCheck={false}
              placeholder={active.defaultModel || t("analysis.modelPlaceholder")}
              className="w-full rounded-sm border border-line bg-transparent px-2.5 py-1.5 font-mono text-xs text-fg outline-none focus:border-line-3"
            />
            {active.models?.length ? (
              <datalist id="kibitz-local-models">
                {active.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            ) : null}
            <span className="mt-1 block font-mono text-[11px] text-fg-3">
              {active.modelsHint}
            </span>
          </label>

          {/* 인증 — CLI 세션은 토큰 값을 읽지 않고 설치된 CLI에 위임한다. */}
          <div>
            {active.authMode === "cli-session" ? (
              <div>
                <span className="mb-1 block text-xs text-fg-3">
                  {t("analysis.cliAccount")}
                </span>
                {active.configured ? (
                  <p className="rounded-sm border border-dashed border-line px-2.5 py-1.5 font-mono text-xs text-fg-2">
                    {t("analysis.cliLoggedIn")}
                  </p>
                ) : (
                  <div className="rounded-sm border border-dashed border-line p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="break-all font-mono text-[11px] text-fg-3">
                        {active.loginCommand}
                      </code>
                      <button
                        onClick={login}
                        disabled={
                          !active.loginAvailable ||
                          (loginState?.provider === provider && loginState.pending)
                        }
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-fg focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <LogIn className="h-3.5 w-3.5" aria-hidden />
                        {loginState?.provider === provider && loginState.pending
                          ? t("analysis.cliLoginWaiting")
                          : t("analysis.cliLogin")}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-fg-3">
                      {t("analysis.cliLoginNote")}
                    </p>
                  </div>
                )}
                {loginState?.provider === provider && loginState.output && (
                  <pre className="mt-2 max-h-28 overflow-auto rounded-sm border border-hair bg-ink-750 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-fg-2">
                    {loginState.output}
                  </pre>
                )}
              </div>
            ) : active.needsKey ? (
              active.configured ? (
                <div>
                  <span className="mb-1 block text-xs text-fg-3">{t("analysis.apiKey")}</span>
                  <p className="rounded-sm border border-dashed border-line px-2.5 py-1.5 font-mono text-xs text-fg-2">
                    {t("analysis.keyOnServer")}
                  </p>
                </div>
              ) : active.keysBlocked ? (
                /* 공개 데모. 입력란을 아예 그리지 않는다 — 낯선 사이트에 키를 넣게
                   해 놓고 거절하는 것이 가장 나쁜 조합이다. */
                <div>
                  <span className="mb-1 block text-xs text-fg-3">{t("analysis.apiKey")}</span>
                  <p className="rounded-sm border border-dashed border-line px-2.5 py-1.5 text-xs leading-relaxed text-fg-2">
                    {t("analysis.keyPublicDemo")}
                  </p>
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-3">{t("analysis.apiKey")}</span>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-…"
                    className="w-full rounded-sm border border-line bg-transparent px-2.5 py-1.5 font-mono text-xs text-fg outline-none focus:border-line-3"
                  />
                  <span className="mt-1 block text-[11px] text-fg-3">
                    {t("analysis.keyNote")}
                  </span>
                </label>
              )
            ) : (
              <div>
                <span className="mb-1 block text-xs text-fg-3">{t("analysis.apiKey")}</span>
                <p className="rounded-sm border border-dashed border-line px-2.5 py-1.5 font-mono text-xs text-fg-2">
                  {t("analysis.keyNotNeeded")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 무엇을 보내는가 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={redact}
                onChange={(e) => setRedact(e.target.checked)}
                className="accent-[color:var(--color-sky)]"
              />
              {t("analysis.redact")}
            </label>
            <button
              onClick={() => setShowBrief((v) => !v)}
              aria-expanded={showBrief}
              className="flex items-center gap-1.5 text-xs text-fg-2 transition-colors duration-100 hover:text-fg"
            >
              <ChevronDown
                className={cn("h-3 w-3 transition-transform duration-100", showBrief && "rotate-180")}
                aria-hidden
              />
              {t("analysis.showBrief", { chars: brief.length.toLocaleString() })}
            </button>
          </div>

          <button
            onClick={run}
            disabled={pending || !ready}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-100",
              pending || !ready
                ? "cursor-not-allowed border border-line text-fg-3/60"
                : "bg-fg text-ink-900 hover:opacity-90 active:scale-[0.97]",
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {pending ? t("analysis.running") : t("analysis.run")}
          </button>
        </div>

        {showBrief && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-fg-3">{t("analysis.briefNote")}</p>
            <pre className="max-h-80 overflow-auto rounded-sm border border-hair bg-ink-750 px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-2">
              {brief}
            </pre>
          </div>
        )}
      </Card>

      {failure && (
        <div className="mt-3 rounded-lg border border-crit/40 bg-crit/[0.055] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-crit">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("analysis.failed")}
          </p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed break-words text-fg-2">
            {failure.error}
          </p>
          {failure.raw && (
            <>
              <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                {t("analysis.rawLabel")}
              </p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-sm border border-hair bg-ink-750 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-fg-3">
                {failure.raw}
              </pre>
            </>
          )}
        </div>
      )}

      {/* 저장된 분석. 최신이 위, 최신만 펼친 상태로 시작한다. */}
      {saved.map((record, i) => (
        <Result
          key={record.id}
          runId={runId}
          record={record}
          defaultOpen={i === 0}
          onForget={async () => setSaved(await forgetAnalysis(runId, record.id))}
        />
      ))}
    </section>
  );
}

/**
 * 공개 데모에서 패널 자리에 오는 것.
 *
 * 그쪽에서는 제공자를 하나도 쓸 수 없다: 키는 받지 않고, 서버의 CLI 계정은 방문자에게
 * 열지 않고, ollama 는 우리 쪽에 없다. 컨트롤을 전부 비활성으로 그려 두는 것보다
 * 왜 없는지 한 번 말하는 편이 정직하다. 어느 쪽을 그릴지는 서버가 정한다 —
 * 배포 종류는 서버만 알고, 조건부 렌더를 컴포넌트 안에 두면 훅 앞에 분기가 생긴다.
 */
export function AnalysisDemoNotice() {
  const t = useT();
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("analysis.title")}</h2>
        <p className="max-w-2xl text-sm text-fg-2">{t("analysis.subtitle")}</p>
      </div>
      <div className="rounded-lg border border-dashed border-line p-5">
        <p className="text-sm font-semibold">{t("analysis.demoTitle")}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          {t("analysis.demoBody")}
        </p>
        <Link
          href="/self-host"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-fg-2 transition-colors duration-100 hover:text-fg"
        >
          {t("analysis.demoCta")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function Result({
  runId,
  record,
  defaultOpen,
  onForget,
}: {
  runId: string;
  record: SavedAnalysis;
  defaultOpen: boolean;
  onForget: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  // 저장된 레코드가 곧 결과다. 아래 렌더는 그대로 쓴다.
  const result = record;

  return (
    <div className="mt-3">
      {/* 이 블록이 다른 곳과 다른 종류의 것임을 먼저 말한다 */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border border-dashed border-line bg-ink-750 px-4 py-2",
          open ? "rounded-t-lg border-b-0" : "rounded-lg",
        )}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={t("analysis.toggle")}
          className="flex items-center text-fg-3 transition-colors duration-100 hover:text-fg-2"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform duration-100", !open && "-rotate-90")}
            aria-hidden
          />
          <span className="sr-only">{t("analysis.toggle")}</span>
        </button>
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
          {t("analysis.unverified")}
        </span>
        {/* 언제 쓴 글인지가 라벨 옆에 있어야 6개월 뒤에도 계산된 판정과 헷갈리지 않는다 */}
        <time dateTime={record.createdAt} className="font-mono text-[11px] text-fg-3">
          {new Date(record.createdAt).toLocaleString()}
        </time>
        <button
          onClick={onForget}
          className="ml-auto rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-3 transition-colors duration-100 hover:border-crit/50 hover:text-crit active:scale-[0.97]"
        >
          {t("analysis.forget")}
        </button>
        <span className="w-full font-mono text-[11px] text-fg-3">
          {result.model}
          {result.usage &&
            ` · ${t("analysis.usage", {
              input: result.usage.input.toLocaleString(),
              output: result.usage.output.toLocaleString(),
            })}`}
          {` · ${t("analysis.briefSize", { chars: result.brief.chars.toLocaleString() })}`}
          {result.brief.redacted && ` · ${t("analysis.redacted")}`}
        </span>
      </div>

      {open && (
      <div className="rounded-b-lg border border-dashed border-line p-5">
        {result.summary && (
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-fg-2">{result.summary}</p>
        )}

        <ul className="flex flex-col gap-3">
          {result.suggestions.map((s, i) => (
            <li key={`${i}-${s.title}`} className="rounded-md border border-hair px-4 py-3.5">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              {s.why && (
                <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-2">{s.why}</p>
              )}
              {s.change && (
                <pre className="mt-2.5 overflow-x-auto rounded-sm border border-hair bg-ink-750 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg">
                  {s.change}
                </pre>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {s.observations.length > 0 && (
                  <span className="text-[11px] text-fg-3">{t("analysis.cites")}</span>
                )}
                {s.observations.map((n) => {
                  const invented = s.ungrounded.includes(n);
                  return invented ? (
                    <span
                      key={n}
                      title={t("analysis.ungroundedNote")}
                      className="rounded-full bg-crit/15 px-2 py-0.5 font-mono text-[11px] font-medium text-crit"
                    >
                      {n} ✕
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={`/traces/${runId}/timeline?obs=${n}`}
                      className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-fg-2 transition-colors duration-100 hover:border-line-3 hover:text-fg"
                    >
                      {n}
                    </Link>
                  );
                })}
                {s.kinds.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-fill px-2 py-0.5 font-mono text-[11px] text-fg-3"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>

        {/* 인용 대조도 규칙이다. 규칙을 숨기면 근거가 아니다. */}
        <p className="mt-4 border-t border-hair pt-3 font-mono text-[11px] text-fg-3">
          {t("analysis.citationCheck")} · {result.citationRule}
          {!result.schemaEnforced && ` · ${t("analysis.bestEffortSchema")}`}
          {` · ${t("analysis.savedNote")}`}
        </p>
      </div>
      )}
    </div>
  );
}
