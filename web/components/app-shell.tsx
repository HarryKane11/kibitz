"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardCheck,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  LayoutGrid,
  ListTree,
  Menu,
  MessagesSquare,
  Ruler,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { LocaleSwitcher, useT } from "@/components/i18n-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { KibitzLogo } from "@/components/logo";
import type { MessageKey } from "@/lib/i18n/shared";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  key: MessageKey;
  icon: typeof LayoutGrid;
}

/**
 * 네비게이션.
 *
 * 첫 방문에서 해야 할 네 가지와 고급 workflow를 분리한다.
 * 모든 엔티티를 같은 무게로 노출하면 tracing을 시작하기도 전에 제품 지도를 외워야 한다.
 */
const CORE_ITEMS: Item[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutGrid },
  { href: "/traces", key: "nav.traces", icon: ListTree },
  { href: "/sessions", key: "nav.sessions", icon: Activity },
  { href: "/failures", key: "nav.failures", icon: ShieldAlert },
];

const GROUPS: { key: MessageKey; items: Item[] }[] = [
  {
    key: "nav.observability",
    items: [
      { href: "/threads", key: "nav.threads", icon: MessagesSquare },
      { href: "/users", key: "nav.users", icon: Users },
    ],
  },
  {
    key: "nav.evaluation",
    items: [
      { href: "/scores", key: "nav.scores", icon: Gauge },
      { href: "/evaluators", key: "nav.evaluators", icon: Ruler },
      { href: "/annotation", key: "nav.annotation", icon: ClipboardCheck },
    ],
  },
  {
    key: "nav.development",
    items: [
      { href: "/datasets", key: "nav.datasets", icon: Database },
      { href: "/prompts", key: "nav.prompts", icon: FileText },
      { href: "/playground", key: "nav.playground", icon: FlaskConical },
      { href: "/skills", key: "nav.skills", icon: Sparkles },
      { href: "/automations", key: "nav.automations", icon: Zap },
    ],
  },
];

const ALL_ITEMS = [
  ...CORE_ITEMS,
  ...GROUPS.flatMap((group) => group.items),
  { href: "/settings", key: "nav.settings" as MessageKey, icon: Settings },
  { href: "/docs", key: "nav.docs" as MessageKey, icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-hair bg-ink-900/92 px-4 backdrop-blur-xl md:hidden">
        <Link href="/dashboard" className="rounded-sm focus-visible:ring-2">
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
              <div>
                <p className="mb-1 px-2.5 text-xs font-medium tracking-wide text-fg-3 uppercase">
                  {t("nav.core")}
                </p>
                <NavItems items={CORE_ITEMS} isActive={isActive} t={t} />
              </div>
              {GROUPS.map((group) => (
                <details
                  key={group.key}
                  className="group/nav"
                  open
                >
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2.5 text-xs font-medium tracking-wide text-fg-3 uppercase hover:bg-hover hover:text-fg-2 [&::-webkit-details-marker]:hidden">
                    {t(group.key)}
                  </summary>
                  <NavItems items={group.items} isActive={isActive} t={t} />
                </details>
              ))}
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

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-hair bg-ink-800 md:flex">
        <Link
          href="/dashboard"
          className="flex h-14 items-center px-5 transition-colors duration-100 hover:text-fg"
        >
          {/* 사이드바 배경은 ink-800 이므로 노드 안쪽도 그 색이어야 선이 뒤로 지나가 보인다 */}
          <KibitzLogo surface="var(--color-ink-800)" />
        </Link>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
          <div>
            <p className="mb-1 px-2.5 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">
              {t("nav.core")}
            </p>
            <NavItems items={CORE_ITEMS} isActive={isActive} t={t} compact />
          </div>
          {GROUPS.map((g) => (
            <details
              key={g.key}
              className="group/nav"
              open
            >
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2.5 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase hover:bg-hover hover:text-fg-2 [&::-webkit-details-marker]:hidden">
                {t(g.key)}
              </summary>
              <NavItems items={g.items} isActive={isActive} t={t} compact />
            </details>
          ))}
        </nav>

        <div className="border-t border-hair px-4 py-3.5">
          <div className="flex gap-1">
            <Link
              href="/docs"
              className="min-h-9 rounded-md px-2 py-2 text-xs text-fg-2 hover:bg-hover hover:text-fg"
            >
              {t("nav.docs")}
            </Link>
            <Link
              href="/settings"
              className="min-h-9 rounded-md px-2 py-2 text-xs text-fg-2 hover:bg-hover hover:text-fg"
            >
              {t("nav.settings")}
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ThemeSwitcher />
            <LocaleSwitcher />
          </div>
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
}: {
  items: Item[];
  isActive: (href: string) => boolean;
  t: ReturnType<typeof useT>;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map(({ href, key, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
              compact ? "min-h-9 py-1.5" : "min-h-11 py-2",
              active
                ? "bg-ink-600 text-fg"
                : "text-fg-2 hover:bg-hover hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t(key)}</span>
          </Link>
        );
      })}
    </div>
  );
}
