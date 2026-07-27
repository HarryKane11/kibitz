"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { usePersisted } from "@/lib/persisted";
import { useT } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/shared";
import { cn } from "@/lib/utils";

export type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { key: ThemeChoice; icon: typeof Sun; label: MessageKey }[] = [
  { key: "light", icon: Sun, label: "settings.light" },
  { key: "dark", icon: Moon, label: "settings.dark" },
  { key: "system", icon: Monitor, label: "settings.system" },
];

/**
 * 테마 전환.
 *
 * 저장값과 실제 클래스를 맞추는 일은 `<head>` 의 인라인 스크립트가 첫 페인트 전에
 * 이미 했다. 여기서는 사용자가 바꿀 때만 클래스를 갱신한다.
 *
 * 바꾸는 그 프레임 동안 트랜지션을 끈다 (`.theme-switching`). 켜두면 화면 전체가
 * 색을 흘리며 번지고, 그건 전환이 아니라 고장으로 보인다.
 */
export function ThemeSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** 접힌 사이드바 — 버튼 하나로 다음 테마로 돌린다 */
  compact?: boolean;
}) {
  const t = useT();
  const [choice, setChoice] = usePersisted<ThemeChoice>("kibitz.theme", "system");
  // 시스템 설정이 바뀌면 `system` 선택은 따라가야 한다.
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const dark = choice === "dark" || (choice === "system" && systemDark);

  // 클래스는 DOM 의 상태다. React state 로 복제하면 인라인 스크립트가 이미 붙여 둔
  // 것과 두 개의 진실이 생기므로, 여기서는 DOM 에 직접 커밋한다.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
  }, [dark]);

  const pick = useCallback(
    (next: ThemeChoice) => {
      const root = document.documentElement;
      root.classList.add("theme-switching");
      setChoice(next);
      // 다음 프레임에 트랜지션을 되살린다 — 한 프레임이면 번짐을 막기에 충분하다.
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => root.classList.remove("theme-switching")),
      );
    },
    [setChoice],
  );

  if (compact) {
    const at = OPTIONS.findIndex((o) => o.key === choice);
    const next = OPTIONS[(at + 1) % OPTIONS.length];
    const Current = OPTIONS[at < 0 ? 0 : at].icon;
    return (
      <button
        onClick={() => pick(next.key)}
        title={`${t("settings.appearance")} · ${t(next.label)}`}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg active:scale-[0.97]",
          className,
        )}
      >
        <Current className="h-4 w-4" aria-hidden />
        <span className="sr-only">{t("settings.appearance")}</span>
      </button>
    );
  }

  return (
    <div
      className={cn("flex rounded-full border border-line p-0.5", className)}
      role="group"
      aria-label={t("settings.appearance")}
    >
      {OPTIONS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => pick(key)}
          aria-pressed={choice === key}
          title={t(label)}
          className={cn(
            "grid h-6 w-7 place-items-center rounded-full transition-colors duration-100",
            choice === key
              ? "bg-fg text-ink-900"
              : "text-fg-3 hover:text-fg-2 active:scale-[0.97]",
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          <span className="sr-only">{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
