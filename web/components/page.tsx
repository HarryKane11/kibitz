import Link from "next/link";
import { cn } from "@/lib/utils";

/** 화면마다 반복되는 껍데기. 제목 위계와 여백을 한 곳에서 정한다. */

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5 pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>/</span>}
          {it.href ? (
            <Link href={it.href} className="transition-colors hover:text-fg-2">
              {it.label}
            </Link>
          ) : (
            <span className="font-mono">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <As className={cn("rounded-lg border border-line bg-ink-800 p-5", className)}>
      {children}
    </As>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-fg-3">
      {message}
    </p>
  );
}

/** 목록 행 — 트레이스·세션·사용자가 전부 같은 리듬을 쓴다. */
export function Row({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          // 행마다 테두리를 두르면 목록이 카드 더미로 읽힌다. 표는 실선 하나로 나눈다 —
          // 그러면 눈이 세는 것이 상자가 아니라 행이 된다.
          "grid items-center gap-3 border-b border-hair px-3 py-2.5 transition-colors hover:bg-hover",
          className,
        )}
      >
        {children}
      </Link>
    </li>
  );
}

export function ColumnHeads({
  cols,
  className,
}: {
  cols: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hidden gap-3 px-4 py-2.5 text-xs tracking-wide text-fg-3 uppercase lg:grid",
        className,
      )}
    >
      {cols.map((c, i) => (
        <span key={c} className={i === 0 ? "" : "text-right"}>
          {c}
        </span>
      ))}
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "crit" | "solid";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "default" && "border border-line text-fg-2",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "crit" && "bg-crit/15 text-crit",
        tone === "solid" && "bg-fg text-ink-900",
      )}
    >
      {children}
    </span>
  );
}

export function KeyValue({
  rows,
}: {
  rows: { k: string; v: React.ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className="text-sm">
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-4 border-b border-hair py-1.5 last:border-b-0">
          <dt className="shrink-0 text-fg-3">{r.k}</dt>
          <dd className={cn("min-w-0 truncate text-right text-fg-2", r.mono && "font-mono text-xs")}>
            {r.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 큰 숫자 하나. 대시보드 밖에서도 쓴다. */
export function Stat({
  n,
  l,
  tone,
}: {
  n: string;
  l: string;
  tone?: "crit" | "muted";
}) {
  return (
    <div>
      <p
        className={cn(
          "text-2xl font-semibold tracking-tight",
          tone === "crit" && "text-crit",
          tone === "muted" && "text-fg-2",
        )}
      >
        {n}
      </p>
      <p className="mt-1 text-xs tracking-wide text-fg-3 uppercase">{l}</p>
    </div>
  );
}
