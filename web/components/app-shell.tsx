"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FileText,
  Coins,
  LayoutGrid,
  ListTree,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { LocaleSwitcher, useT } from "@/components/i18n-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { KibitzLogo } from "@/components/logo";
import { LiveWatch } from "@/components/live-watch";
import type { MessageKey } from "@/lib/i18n/shared";
import { usePersisted } from "@/lib/persisted";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  key: MessageKey;
  icon: typeof LayoutGrid;
}

/**
 * 네비게이션.
 *
 * 그룹이 없다. 여섯 항목에 접이식 그룹 세 개를 씌우면 내용보다 장식이 많아지고,
 * 사용자는 트레이싱을 시작하기 전에 제품 지도를 먼저 외워야 한다.
 *
 * 순서는 "묻는 순서"다 — 토큰을 어디 썼나 → 무슨 일이 있었나 → 언제였나 →
 * 무엇을 자동화할까 → 무엇이 반복해서 깨지나. 마지막 대시보드는 요약이라
 * 답이 아니라 출발점이므로 맨 위가 아니다.
 */
const NAV_ITEMS: Item[] = [
  { href: "/usage", key: "nav.usage" as MessageKey, icon: Coins },
  { href: "/traces", key: "nav.traces", icon: ListTree },
  { href: "/sessions", key: "nav.sessions", icon: Activity },
  { href: "/skills", key: "nav.skills", icon: Sparkles },
  { href: "/failures", key: "nav.failures", icon: ShieldAlert },
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutGrid },
];

const ALL_ITEMS = [
  ...NAV_ITEMS,
  { href: "/settings", key: "nav.settings" as MessageKey, icon: Settings },
  { href: "/docs", key: "nav.docs" as MessageKey, icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  /**
   * 사이드바 접기.
   *
   * localStorage 에 남긴다 — 접어 둔 사람은 접힌 채로 일하고 싶은 것이고, 새로고침마다
   * 다시 펴지면 그 설정은 설정이 아니다. `useEffect` 로 읽으면 첫 프레임이 펴진 상태로
   * 그려진 뒤 접히므로, 외부 저장소를 다루는 훅으로 읽는다 (lib/persisted.ts).
   *
   * 폭 트랜지션은 넣지 않는다. width 애니메이션은 매 프레임 본문 전체를 다시
   * 레이아웃하게 만들고, 그 사이에 라벨이 눌려 보인다. 즉시 바뀌는 편이 낫다.
   */
  const [collapsed, setCollapsed] = usePersisted("kibitz.navCollapsed", false);

  /**
   * ⌘[ / Ctrl+[ 로 접는다.
   *
   * `⌘B` 를 쓰지 않는 이유: 브라우저·에디터마다 이미 다른 데 매여 있고, 무엇보다
   * 텍스트 입력 중에 굵게가 필요한 자리(어노테이션 코멘트 등)를 빼앗는다.
   * 입력 요소에 포커스가 있으면 무엇이든 가로채지 않는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || !(e.metaKey || e.ctrlKey)) return;
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-hair bg-ink-900/92 px-4 backdrop-blur-xl md:hidden">
        <Link href="/usage" className="rounded-sm focus-visible:ring-2">
          <KibitzLogo />
        </Link>
        <details className="group relative ml-auto">
          <summary
            aria-label={t("nav.menu")}
            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-line text-fg-2 transition-colors hover:border-line-3 hover:text-fg focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <span className="sr-only">{t("nav.menu")}</span>
          </summary>
          <div className="absolute top-[calc(100%+8px)] right-0 w-[min(88vw,320px)] rounded-lg border border-line bg-ink-800 p-3 shadow-md">
            <nav className="max-h-[min(68vh,560px)] space-y-4 overflow-y-auto">
              <NavItems items={NAV_ITEMS} isActive={isActive} t={t} />
            </nav>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
              <Link href="/docs" className="min-h-11 px-2 py-3 text-sm text-fg-2">
                {t("nav.docs")}
              </Link>
              <ThemeSwitcher />
              <LocaleSwitcher />
            </div>
          </div>
        </details>
      </header>

      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hair bg-ink-800 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
        aria-label={t("nav.sidebar")}
      >
        <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "px-5")}>
          {!collapsed && (
            <Link
              href="/usage"
              className="transition-colors duration-100 hover:text-fg"
            >
              {/* 사이드바 배경은 ink-800 이므로 노드 안쪽도 그 색이어야 선이 뒤로 지나가 보인다 */}
              <KibitzLogo surface="var(--color-ink-800)" />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            title={`${collapsed ? t("nav.expand") : t("nav.collapse")} (⌘[)`}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg active:scale-[0.97]",
              !collapsed && "ml-auto",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">{collapsed ? t("nav.expand") : t("nav.collapse")}</span>
          </button>
        </div>

        {/* 실행 중인 런이 있으면 여기 뜬다. 접혀 있으면 점만 남는다. */}
        {!collapsed && (
          <div className="px-3 pb-1 empty:hidden">
            <LiveWatch />
          </div>
        )}

        <nav
          className={cn(
            "flex flex-1 flex-col overflow-y-auto py-2",
            collapsed ? "items-center gap-1 px-1.5" : "gap-3 px-3",
          )}
        >
          <NavItems
            items={NAV_ITEMS}
            isActive={isActive}
            t={t}
            compact
            iconOnly={collapsed}
          />
        </nav>

        <div
          className={cn(
            "border-t border-hair",
            collapsed ? "flex flex-col items-center gap-1 px-1.5 py-2" : "px-3 py-3",
          )}
        >
          {collapsed ? (
            <>
              <Link
                href="/docs"
                title={t("nav.docs")}
                className="grid h-9 w-9 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg"
              >
                <FileText className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t("nav.docs")}</span>
              </Link>
              <Link
                href="/settings"
                title={t("nav.settings")}
                className="grid h-9 w-9 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg"
              >
                <Settings className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t("nav.settings")}</span>
              </Link>
              {/* 접혀도 테마·언어는 닿을 수 있어야 한다. 세그먼트가 설 자리는 없으니
                  버튼 하나로 다음 값으로 돌린다 — 접힌 레일의 관례다. */}
              <ThemeSwitcher compact />
              <LocaleSwitcher compact />
            </>
          ) : (
            <>
              {/*
                문서·설정은 내비게이션이므로 위 목록과 같은 리듬으로 그린다.
                두 칸을 같은 폭으로 나눠 두면 라벨 길이가 언어마다 달라도 정렬이 유지된다.
              */}
              <div className="grid grid-cols-2 gap-1">
                <Link
                  href="/docs"
                  className="flex min-h-8 items-center gap-2 rounded-md px-2 text-xs text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t("nav.docs")}</span>
                </Link>
                <Link
                  href="/settings"
                  className="flex min-h-8 items-center gap-2 rounded-md px-2 text-xs text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
                >
                  <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t("nav.settings")}</span>
                </Link>
              </div>
              {/* 같은 모양의 두 세그먼트를 한 줄에. 높이가 같아야 줄이 하나로 읽힌다. */}
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hair pt-2.5">
                <ThemeSwitcher />
                <LocaleSwitcher />
              </div>
            </>
          )}
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>

      <CommandPalette
        items={ALL_ITEMS.map((item) => ({
          href: item.href,
          label: t(item.key),
          group: t("nav.core"),
        }))}
      />
    </div>
  );
}

function NavItems({
  items,
  isActive,
  t,
  compact = false,
  iconOnly = false,
}: {
  items: Item[];
  isActive: (href: string) => boolean;
  t: ReturnType<typeof useT>;
  compact?: boolean;
  /** 접힌 사이드바 — 아이콘만, 이름은 title 과 스크린리더로 */
  iconOnly?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", iconOnly && "items-center")}>
      {items.map(({ href, key, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={iconOnly ? t(key) : undefined}
            className={cn(
              "flex items-center rounded-md text-sm transition-colors",
              iconOnly
                ? "h-9 w-9 justify-center"
                : cn("gap-2.5 px-2.5", compact ? "min-h-9 py-1.5" : "min-h-11 py-2"),
              active
                ? "bg-ink-600 text-fg"
                : "text-fg-2 hover:bg-hover hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {iconOnly ? (
              <span className="sr-only">{t(key)}</span>
            ) : (
              <span className="truncate">{t(key)}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
