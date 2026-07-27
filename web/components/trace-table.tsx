"use client";

import { BrandOrNothing } from "@/components/brand";
import { brandForModel, brandForSource } from "@/lib/brand";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersisted } from "@/lib/persisted";
import Link from "next/link";
import { Columns3 } from "lucide-react";
import type { Run } from "@/lib/types";
import { buildTree } from "@/lib/tree";
import { useT } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/shared";
import { MiniRibbon } from "@/components/viz";
import { STATUS_TEXT, fmtDuration, fmtTokens, fmtUsd, relTime } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const COLS_KEY = "kibitz.traceColumns";

/**
 * 표시할 수 있는 컬럼.
 *
 * `run` 은 끌 수 없다 — 그것만 남는 표는 표가 아니다.
 * 순서는 고정이다. 사용자가 재배열하면 컬럼 헤더가 어디 갔는지 매번 찾게 된다.
 */
const COLUMNS = [
  { key: "shape", label: "traces.colShape", w: "176px", align: "left" },
  { key: "accuracy", label: "traces.colAccuracy", w: "72px", align: "right" },
  { key: "groups", label: "traces.colGroups", w: "64px", align: "right" },
  { key: "duration", label: "traces.colDuration", w: "84px", align: "right" },
  { key: "tokens", label: "traces.colTokens", w: "72px", align: "right" },
  { key: "cost", label: "traces.colCost", w: "80px", align: "right" },
  { key: "model", label: "traces.colModel", w: "148px", align: "left" },
  { key: "started", label: "traces.colStarted", w: "84px", align: "right" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

// 기본은 다섯 개. 더 켜면 제목 칸이 좁아져 무슨 런인지 못 읽는다 —
// 컬럼을 늘리는 대가는 항상 제목이 치른다.
const DEFAULT_ON: ColKey[] = ["shape", "accuracy", "duration", "tokens", "cost"];

export function TraceTable({ runs }: { runs: Run[] }) {
  const t = useT();
  const [saved, setSaved] = usePersisted<string[]>(COLS_KEY, DEFAULT_ON);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // 저장된 목록에 지금은 없는 컬럼이 남아 있을 수 있다 — 걸러낸 뒤 쓴다.
  const on = useMemo(() => {
    const valid = saved.filter((k): k is ColKey => COLUMNS.some((c) => c.key === k));
    return valid.length ? valid : DEFAULT_ON;
  }, [saved]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (key: ColKey) =>
    setSaved(on.includes(key) ? on.filter((k) => k !== key) : [...on, key]);

  const shown = COLUMNS.filter((c) => on.includes(c.key));
  const template = `minmax(0,1fr) ${shown.map((c) => c.w).join(" ")}`;

  // 묶음 수는 트리에서 나온다. 표에서 다시 세면 트리와 어긋난다.
  const groups = useMemo(
    () => new Map(runs.map((r) => [r.id, buildTree(r.turns).length])),
    [runs],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-2.5">
        <p className="text-xs text-fg-3">{t("units.traceCount", { n: runs.length })}</p>

        <div className="relative" ref={menu}>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-3 transition-colors duration-100 hover:border-line-2 hover:text-fg-2 active:scale-[0.97]"
          >
            <Columns3 className="h-3 w-3" aria-hidden />
            {t("traces.columns")}
          </button>

          {open && (
            <div
              role="menu"
              className="animate-pop absolute top-full right-0 z-50 mt-1.5 w-52 origin-top-right rounded-lg border border-line bg-ink-700 p-1.5 shadow-2xl"
            >
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-xs text-fg-2 select-none hover:bg-fill"
                >
                  <input
                    type="checkbox"
                    checked={on.includes(c.key)}
                    onChange={() => toggle(c.key)}
                    className="h-3 w-3 accent-[color:var(--color-sky)]"
                  />
                  {t(c.label as MessageKey)}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* sticky 헤더 — 160행을 스크롤하면서도 어느 열인지 알아야 한다 */}
      <div
        className="sticky top-0 z-10 hidden gap-5 border-b border-hair bg-ink-900/95 py-2 backdrop-blur lg:grid"
        style={{ gridTemplateColumns: template }}
      >
        <span className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t("traces.colRun")}
        </span>
        {shown.map((c) => (
          <span
            key={c.key}
            className={cn(
              "text-[11px] font-medium tracking-wide text-fg-3 uppercase",
              c.align === "right" && "text-right",
            )}
          >
            {t(c.label as MessageKey)}
          </span>
        ))}
      </div>

      <ul>
        {runs.map((r) => (
          <li key={r.id} className="border-b border-hair last:border-b-0">
            <Link
              href={`/traces/${r.id}`}
              className="grid grid-cols-1 items-center gap-x-5 gap-y-2 py-3 transition-colors duration-100 hover:bg-hover lg:grid-cols-[var(--cols)]"
              style={{ "--cols": template } as React.CSSProperties}
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">
                  {r.title}
                  <span className="text-fg-2">{r.titleTail}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-fg-3">
                  {/* 어느 런타임이 만든 런인가. 목록에서 이걸 못 보면 Claude Code 세션과
                      SDK 로 계측한 프로덕션 런이 같은 줄처럼 읽힌다 — 둘은 볼 때
                      기대하는 것이 다르다. */}
                  {r.source && (
                    <span className="flex items-center gap-1 font-mono">
                      <BrandOrNothing name={brandForSource(r.source)} className="h-3 w-3" />
                      {r.source}
                    </span>
                  )}
                  <span className="font-mono">{r.agent}</span>
                  <span className="font-mono">{r.id}</span>
                  <span className={STATUS_TEXT[r.status]}>{t(`status.${r.status}`)}</span>
                  {r.userId && <span className="font-mono">{r.userId}</span>}
                  {(r.tags ?? []).slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded-full border border-line px-1.5">
                      {tag}
                    </span>
                  ))}
                </p>
              </div>

              {shown.map((c) => (
                <Cell key={c.key} align={c.align}>
                  {c.key === "shape" && <MiniRibbon turns={r.turns} />}
                  {c.key === "accuracy" && (
                    <span
                      className={cn(
                        "text-[15px] font-semibold",
                        r.score.accuracy < 70 ? "text-crit" : "text-fg",
                      )}
                    >
                      {r.score.accuracy}%
                    </span>
                  )}
                  {c.key === "groups" && (
                    <span className="font-mono text-xs text-fg-3">{groups.get(r.id)}</span>
                  )}
                  {c.key === "duration" && (
                    <span className="font-mono text-xs text-fg-3">
                      {fmtDuration(r.durationMs, t)}
                    </span>
                  )}
                  {c.key === "tokens" && (
                    <span className="font-mono text-xs text-fg-3">
                      {fmtTokens(r.totalTokens)}
                    </span>
                  )}
                  {c.key === "cost" && (
                    <span className="font-mono text-xs text-fg-3">{fmtUsd(r.costUsd)}</span>
                  )}
                  {c.key === "model" && (
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-fg-3">
                      <BrandOrNothing name={brandForModel(r.model)} className="h-3 w-3 opacity-70" />
                      <span className="truncate">{r.model}</span>
                    </span>
                  )}
                  {c.key === "started" && (
                    <span className="font-mono text-xs text-fg-3">
                      {relTime(r.startedAt, t)}
                    </span>
                  )}
                </Cell>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({
  align,
  children,
}: {
  align: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>{children}</div>
  );
}
