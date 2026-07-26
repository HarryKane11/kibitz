"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  href: string;
  label: string;
  group: string;
}

/**
 * 커맨드 팔레트 (⌘K).
 *
 * **애니메이션이 없다.** 하루에 수백 번 여는 것이고, 그런 곳의 트랜지션은 도움이
 * 아니라 지연이다 (Raycast 가 열기·닫기 애니메이션을 두지 않는 이유와 같다).
 *
 * 트레이스 id 를 붙여넣으면 바로 그 트레이스로 간다. 실무에서 id 는 로그·슬랙에서
 * 복사해 오는 것이므로, 목록을 훑게 만들 이유가 없다.
 */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 트레이스 id 처럼 보이면 그 항목을 맨 위에 얹는다
  const looksLikeId = /^[a-z]{2,4}_[a-z0-9]{4,}$/i.test(q.trim());

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = items.filter((i) => !needle || i.label.toLowerCase().includes(needle));
    const out: PaletteItem[] = [];
    if (looksLikeId) {
      out.push({
        href: `/traces/${q.trim()}`,
        label: q.trim(),
        group: t("palette.traces"),
      });
    }
    return [...out, ...pages];
  }, [items, q, looksLikeId, t]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      setCursor(0);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      // 백드롭. 페이드도 넣지 않는다 — 즉시 나타나는 것이 이 빈도에 맞다.
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-900/70 pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.open")}
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-line bg-ink-700 shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-hair px-4">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setCursor((c) => Math.min(results.length - 1, c + 1));
              else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
              else if (e.key === "Enter" && results[cursor]) go(results[cursor].href);
              else if (e.key === "Escape") setOpen(false);
              else return;
              e.preventDefault();
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent py-3 text-sm text-fg placeholder:text-fg-3 focus:outline-none"
          />
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-3">{t("palette.noResults")}</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {results.map((r, i) => (
              <li key={`${r.group}:${r.href}`}>
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                    i === cursor ? "bg-ink-600 text-fg" : "text-fg-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="shrink-0 text-[11px] text-fg-3">{r.group}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-hair px-4 py-2 text-[11px] text-fg-3">
          {t("palette.hint")}
        </p>
      </div>
    </div>
  );
}
