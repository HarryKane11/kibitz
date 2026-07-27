"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { LOCALES } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE, makeTranslate, type Translate } from "@/lib/i18n/shared";
import { cn } from "@/lib/utils";

interface Ctx {
  locale: Locale;
  t: Translate;
}

const I18nCtx = createContext<Ctx | null>(null);

/**
 * 사전을 서버에서 한 번 읽어 클라이언트로 내려준다.
 *
 * 라우트에 로케일 접두사를 붙이지 않는다. 옵저버빌리티 대시보드는 내부 도구라
 * SEO 대상이 아니고, 접두사는 모든 링크와 미들웨어를 오염시킨다.
 * 쿠키 한 개로 충분하고 서버 렌더에서도 같은 값을 읽는다.
 */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({ locale, t: makeTranslate(dictionary) }),
    [locale, dictionary],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): Translate {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

const LABEL: Record<Locale, string> = { en: "English", ko: "한국어" };

/** 좁은 자리용 짧은 라벨. 전체 이름은 title 과 스크린리더로 간다. */
const SHORT: Record<Locale, string> = { en: "EN", ko: "한" };

export function LocaleSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** 접힌 사이드바 — 버튼 하나로 다음 언어로 돌린다 */
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  const set = useCallback(
    (next: Locale) => {
      // 1년. 기기에 남고 서버 렌더에서도 같은 값을 읽는다.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      start(() => router.refresh());
    },
    [router],
  );

  if (compact) {
    const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
    return (
      <button
        onClick={() => set(next)}
        disabled={pending}
        title={`${t("a11y.localeSwitcher")} · ${LABEL[next]}`}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-[11px] font-semibold text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg active:scale-[0.97] disabled:opacity-60",
          className,
        )}
      >
        {SHORT[locale]}
        <span className="sr-only">{t("a11y.localeSwitcher")}</span>
      </button>
    );
  }

  /*
   * 테마 전환과 **같은 모양**이다. 나란히 놓이는 두 컨트롤이 서로 다른 껍데기를
   * 쓰면 (하나는 아이콘 + pill, 하나는 세그먼트) 정렬이 맞아도 어긋나 보인다.
   * 그래서 아이콘·체크 장식을 버리고 세그먼트 하나로 맞췄다.
   */
  return (
    <div
      className={cn("flex rounded-full border border-line p-0.5", className)}
      role="group"
      aria-label={t("a11y.localeSwitcher")}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            onClick={() => !active && set(l)}
            aria-pressed={active}
            disabled={pending}
            title={LABEL[l]}
            className={cn(
              "grid h-6 min-w-7 place-items-center rounded-full px-1.5 text-[11px] font-semibold transition-colors duration-100 disabled:opacity-60",
              active
                ? "bg-fg text-ink-900"
                : "text-fg-3 hover:text-fg-2 active:scale-[0.97]",
            )}
          >
            {SHORT[l]}
            <span className="sr-only">{LABEL[l]}</span>
          </button>
        );
      })}
    </div>
  );
}

