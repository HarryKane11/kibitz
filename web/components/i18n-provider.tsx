"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
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

export function LocaleSwitcher({ className }: { className?: string }) {
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

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t("a11y.localeSwitcher")}
    >
      <Languages className="mr-1 h-3.5 w-3.5 text-fg-3" aria-hidden />
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            onClick={() => !active && set(l)}
            aria-pressed={active}
            disabled={pending}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-100 active:scale-[0.97] disabled:opacity-60",
              active
                ? "border-fg bg-fg text-ink-900"
                : "border-line text-fg-3 hover:border-line-2 hover:text-fg-2",
            )}
          >
            {active && <Check className="h-3 w-3" aria-hidden />}
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
