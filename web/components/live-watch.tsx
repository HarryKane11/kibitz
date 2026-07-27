"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * 살아 있는 런을 감시한다.
 *
 * 서버 컴포넌트로 그린 화면은 스스로 갱신되지 않는다. 에이전트가 돌고 있는 동안
 * 사용자가 F5 를 눌러야 새 스팬이 보인다면 그건 실시간 감시가 아니다. 이 컴포넌트가
 * 수집 버전을 지켜보다가 **바뀔 때만** `router.refresh()` 를 부른다 — 서버 컴포넌트가
 * 다시 렌더되고, 클라이언트 상태(선택한 관측, 렌즈, 확대)는 유지된다.
 *
 * 폴링 간격을 상황에 맞춘다. 열린 런이 없으면 느리게, 있으면 빠르게, 탭이 숨으면
 * 멈춘다 — 보이지 않는 탭을 위해 서버를 두드리는 것은 그냥 낭비다.
 */

const FAST_MS = 2000; // 돌고 있는 런이 있을 때
const SLOW_MS = 15000; // 없을 때 — 새 런이 시작되는 것도 알아채야 한다

interface LiveState {
  version: string;
  open: { id: string; title: string; agent: string; spans: number }[];
}

export function LiveWatch({ className }: { className?: string }) {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<LiveState | null>(null);
  // 첫 응답의 버전을 기준으로 삼는다. 마운트 직후에 새로고침하면 방금 그린 화면을
  // 한 번 더 그리게 되고, 그 깜빡임은 버그로 보인다.
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      if (!alive) return;
      try {
        if (document.visibilityState === "visible") {
          const res = await fetch("/api/live", { cache: "no-store" });
          if (res.ok) {
            const next = (await res.json()) as LiveState;
            if (!alive) return;
            setState(next);
            if (seen.current === null) {
              seen.current = next.version;
            } else if (seen.current !== next.version) {
              seen.current = next.version;
              router.refresh();
            }
          }
        }
      } catch {
        // 서버가 잠깐 없을 수도 있다. 다음 tick 에 다시 물어본다 —
        // 감시 도구가 감시 대상 때문에 에러를 띄우면 안 된다.
      }
      const delay = state?.open.length ? FAST_MS : SLOW_MS;
      timer = window.setTimeout(tick, delay);
    };

    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // state?.open.length 는 간격만 정한다. 의존성에 넣으면 응답마다 루프가 재시작된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const open = state?.open ?? [];
  if (open.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-fg-2",
        className,
      )}
      // aria-live 로 알린다 — 화면을 보고 있지 않은 사용자도 런이 시작된 것을 안다.
      aria-live="polite"
      title={open.map((r) => `${r.title} (${r.spans})`).join("\n")}
    >
      {/* 점 하나만 깜빡인다. 이건 100회/일 동작이 아니라 상태 표시이므로 움직여도 된다 */}
      <Radio className="h-3 w-3 animate-pulse text-warn motion-reduce:animate-none" aria-hidden />
      {t("live.running", { n: open.length })}
    </div>
  );
}
