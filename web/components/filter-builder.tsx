"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Check, Copy, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  EMPTY_QUERY,
  FIELDS,
  fromParams,
  opsFor,
  toParams,
  toQueryLanguage,
  type Clause,
  type Field,
  type Op,
  type Query,
  type Shortcut,
} from "@/lib/query";
import { usePersisted } from "@/lib/persisted";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const VIEWS_KEY = "kibitz.savedViews";

interface SavedView {
  name: string;
  /** 직렬화된 URL 파라미터. 쿼리 모양이 바뀌어도 저장된 뷰가 안 깨진다. */
  params: string;
}

/**
 * 필터 빌더.
 *
 * 상태는 URL 에 둔다 — 필터가 걸린 화면을 그대로 링크로 넘길 수 있어야 팀에서
 * 쓸모가 있다. 저장된 뷰는 URL 파라미터 문자열로 보관하므로 쿼리 스키마가
 * 나중에 바뀌어도 예전 뷰가 깨지지 않는다.
 *
 * 초안 상태는 팝오버가 **소유**한다. 부모에 두고 effect 로 동기화하면 캐스케이드
 * 렌더가 되고, 열 때마다 새로 마운트하면 초기값이 자연히 최신이 된다.
 */
export function FilterBuilder({
  shortcuts,
  matched,
  total,
  className,
}: {
  shortcuts: Shortcut[];
  matched: number;
  total: number;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const applied = useMemo(() => fromParams((k) => params.get(k) ?? undefined), [params]);

  const [open, setOpen] = useState(false);
  const [views, setViews] = usePersisted<SavedView[]>(VIEWS_KEY, []);
  const anchor = useRef<HTMLDivElement>(null);

  const push = useCallback(
    (q: Query) => {
      const s = toParams(q).toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // 외부 클릭·Escape 로 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (anchor.current && !anchor.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount =
    applied.clauses.filter((c) => c.value.trim()).length + (applied.q ? 1 : 0);

  const saveView = () => {
    const name = window.prompt(t("filters.viewName"))?.trim();
    if (!name) return;
    setViews([
      ...views.filter((v) => v.name !== name),
      { name, params: toParams(applied).toString() },
    ]);
  };

  return (
    <div className={cn("flex flex-col gap-2.5 border-b border-hair pb-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 전문 검색. 제어하지 않는다 — URL 이 원천이고 입력은 그 초기값만 받는다.
            `key` 로 URL 이 바뀔 때만 다시 마운트되므로 타이핑 중에 값이 튀지 않는다. */}
        <form
          key={applied.q ?? ""}
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("q");
            push({ ...applied, q: String(v ?? "").trim() || undefined });
          }}
          className="relative"
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={applied.q ?? ""}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("common.search")}
            spellCheck={false}
            autoComplete="off"
            className="w-72 rounded-full border border-line bg-transparent py-1 pr-3 pl-8 text-xs text-fg placeholder:text-fg-3 focus:border-line-3 focus:outline-none"
          />
        </form>

        <div className="relative" ref={anchor}>
          <button
            // mousedown 에 열면 누른 즉시 반응한다 (click 은 release 를 기다린다)
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-100 active:scale-[0.97]",
              activeCount > 0
                ? "border-fg bg-fg text-ink-900"
                : "border-line text-fg-3 hover:border-line-2 hover:text-fg-2",
            )}
          >
            <SlidersHorizontal className="h-3 w-3" aria-hidden />
            {t("filters.addFilter")}
            {activeCount > 0 && <span>({activeCount})</span>}
          </button>

          {open && (
            <FilterPopover
              initial={applied}
              onApply={(q) => {
                push(q);
                setOpen(false);
              }}
            />
          )}
        </div>

        {activeCount > 0 && (
          <>
            <button
              onClick={saveView}
              className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-3 transition-colors duration-100 hover:border-line-2 hover:text-fg-2 active:scale-[0.97]"
            >
              <Bookmark className="h-3 w-3" aria-hidden />
              {t("filters.saveView")}
            </button>
            <button
              onClick={() => push(EMPTY_QUERY)}
              className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-3 transition-colors duration-100 hover:border-line-2 hover:text-fg-2 active:scale-[0.97]"
            >
              <X className="h-3 w-3" aria-hidden />
              {t("filters.clearAll")}
            </button>
          </>
        )}

        <p className="ml-auto text-xs text-fg-3">
          {t("filters.matched", { n: matched, total })}
        </p>
      </div>

      {/* 이 데이터에 실제로 있는 값들 — 존재하지 않는 값을 고를 수 없다 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] tracking-wide text-fg-3 uppercase">
          {t("filters.shortcuts")}
        </span>
        {shortcuts.map((s) => {
          const on = applied.clauses.some(
            (c) => c.field === s.field && c.op === "is" && c.value === s.value,
          );
          return (
            <button
              key={`${s.field}:${s.value}`}
              onClick={() =>
                push(
                  on
                    ? {
                        ...applied,
                        clauses: applied.clauses.filter(
                          (c) => !(c.field === s.field && c.value === s.value),
                        ),
                      }
                    : {
                        ...applied,
                        clauses: [
                          ...applied.clauses,
                          { field: s.field, op: "is" as Op, value: s.value },
                        ],
                      },
                )
              }
              aria-pressed={on}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors duration-100 active:scale-[0.97]",
                on
                  ? "border-fg bg-fg text-ink-900"
                  : "border-line text-fg-3 hover:border-line-2 hover:text-fg-2",
              )}
            >
              {s.value}
              <span className={cn("ml-1", on ? "text-ink-900/60" : "text-fg-3/70")}>
                {s.count}
              </span>
            </button>
          );
        })}
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] tracking-wide text-fg-3 uppercase">
            {t("filters.savedViews")}
          </span>
          {views.map((v) => (
            <span key={v.name} className="flex items-center">
              <button
                onClick={() => router.replace(v.params ? `${pathname}?${v.params}` : pathname)}
                className="rounded-l-full border border-r-0 border-line py-0.5 pr-1.5 pl-2 text-[11px] text-fg-2 transition-colors duration-100 hover:border-line-2 hover:text-fg"
              >
                {v.name}
              </button>
              <button
                onClick={() => setViews(views.filter((x) => x.name !== v.name))}
                aria-label={t("filters.deleteView")}
                className="rounded-r-full border border-line py-0.5 pr-1.5 pl-1 text-fg-3 transition-colors duration-100 hover:border-line-2 hover:text-crit"
              >
                <Trash2 className="h-2.5 w-2.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 팝오버 — 초안 상태를 소유한다 ──────────────────────────── */

function FilterPopover({
  initial,
  onApply,
}: {
  initial: Query;
  onApply: (q: Query) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Query>(() =>
    // 값이 빈 절은 작성 중이던 것이다. 열 때 한 줄은 남겨 둔다.
    initial.clauses.length ? initial : { ...initial, clauses: [{ field: "status", op: "is", value: "" }] },
  );
  const [copied, setCopied] = useState(false);

  const setClause = (i: number, patch: Partial<Clause>) =>
    setDraft((d) => ({
      ...d,
      clauses: d.clauses.map((c, k) => {
        if (k !== i) return c;
        const next = { ...c, ...patch };
        // 필드가 바뀌면 연산자 집합도 바뀐다 — 남은 연산자가 유효하지 않으면 첫 번째로.
        const allowed = opsFor(next.field);
        if (!allowed.includes(next.op)) next.op = allowed[0];
        return next;
      }),
    }));

  return (
    <div
      role="dialog"
      aria-label={t("filters.title")}
      // 트리거 기준으로 열린다 — 팝오버는 origin-aware 여야 붙어 있는 느낌이 난다
      className="animate-pop absolute top-full left-0 z-50 mt-1.5 w-[540px] origin-top-left rounded-lg border border-line bg-ink-700 p-3 shadow-2xl"
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        {(["and", "or"] as const).map((j) => (
          <button
            key={j}
            onClick={() => setDraft((d) => ({ ...d, join: j }))}
            aria-pressed={draft.join === j}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-100",
              draft.join === j ? "bg-fg text-ink-900" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {t(j === "and" ? "filters.joinAnd" : "filters.joinOr")}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {draft.clauses.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Select
              label={t("filters.field")}
              value={c.field}
              onChange={(v) => setClause(i, { field: v as Field })}
              options={FIELDS as readonly string[]}
              className="w-32"
            />
            <Select
              label={t("filters.operator")}
              value={c.op}
              onChange={(v) => setClause(i, { op: v as Op })}
              options={opsFor(c.field) as readonly string[]}
              className="w-28"
            />
            <input
              value={c.value}
              onChange={(e) => setClause(i, { value: e.target.value })}
              placeholder={t("filters.value")}
              aria-label={t("filters.value")}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-sm border border-line bg-transparent px-2 py-1 text-xs text-fg placeholder:text-fg-3 focus:border-line-3 focus:outline-none"
            />
            <button
              onClick={() =>
                setDraft((d) => ({ ...d, clauses: d.clauses.filter((_, k) => k !== i) }))
              }
              aria-label={t("filters.remove")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-3 transition-colors duration-100 hover:bg-fill hover:text-fg-2"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          setDraft((d) => ({
            ...d,
            clauses: [...d.clauses, { field: "status", op: "is", value: "" }],
          }))
        }
        className="mt-2 flex items-center gap-1.5 text-xs text-fg-2 transition-colors duration-100 hover:text-fg"
      >
        <Plus className="h-3 w-3" aria-hidden />
        {t("filters.addCondition")}
      </button>

      <div className="mt-3 flex items-center gap-2 border-t border-hair pt-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-3">
          {toQueryLanguage(draft)}
        </code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(toQueryLanguage(draft));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          aria-label={t("filters.copyQuery")}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-3 transition-colors duration-100 hover:bg-fill hover:text-fg-2"
        >
          {copied ? (
            <Check className="h-3 w-3 text-fg" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
        </button>
        <button
          onClick={() => onApply(draft)}
          className="rounded-full bg-fg px-3 py-1 text-xs font-semibold text-ink-900 transition-transform duration-100 active:scale-[0.97]"
        >
          {t("filters.applyFilter")}
        </button>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  className?: string;
}) {
  return (
    <label className={cn("shrink-0", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-sm border border-line bg-transparent px-2 py-1 font-mono text-xs text-fg-2 focus:border-line-3 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
