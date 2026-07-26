import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { LocaleSwitcher } from "@/components/i18n-provider";
import { KibitzLogo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getT } from "@/lib/i18n";

const LINKS = [
  ["/product", "nav.product"],
  ["/integrations", "nav.integrations"],
  ["/self-host", "nav.selfHost"],
  ["/compare/langfuse", "nav.compare"],
  ["/docs", "nav.docs"],
] as const;

export async function SiteHeader() {
  const t = await getT();

  return (
    <>
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-fg px-3 py-2 text-sm text-ink-900 focus:translate-y-0"
      >
        {t("a11y.skipContent")}
      </a>
      <header className="sticky top-0 z-40 border-b border-hair bg-ink-900/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1240px] items-center gap-5 px-5 sm:px-8">
          <Link
            href="/"
            aria-label={t("app.name")}
            className="rounded-sm focus-visible:ring-2"
          >
            <KibitzLogo />
          </Link>

          <nav
            className="ml-auto hidden items-center gap-1 md:flex"
            aria-label={t("landing.utilityNav")}
          >
            {LINKS.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                className="min-h-11 rounded-md px-3 py-3 text-sm text-fg-2 transition-colors hover:text-fg focus-visible:ring-2"
              >
                {t(key)}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-fg transition-colors hover:border-line-3 focus-visible:ring-2"
            >
              {t("landing.openApp")}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <details className="group relative md:hidden">
              <summary
                aria-label={t("nav.menu")}
                className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-line text-fg-2 focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </summary>
              <nav className="absolute top-[calc(100%+8px)] right-0 w-64 rounded-lg border border-line bg-ink-800 p-2 shadow-md">
                {LINKS.map(([href, key]) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm text-fg-2 hover:bg-hover hover:text-fg focus-visible:ring-2"
                  >
                    {t(key)}
                  </Link>
                ))}
                <Link
                  href="/dashboard"
                  className="mt-1 flex min-h-11 items-center justify-between rounded-md border border-line px-3 text-sm font-semibold"
                >
                  {t("landing.openApp")}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </nav>
            </details>
            <span className="hidden sm:inline-flex">
              <ThemeSwitcher />
            </span>
            <LocaleSwitcher />
          </div>
        </div>
      </header>
    </>
  );
}
