"use client";

import { useId, useMemo, useState } from "react";
import { Table2, TrendingDown, TrendingUp } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { fmtDuration, fmtTokens, fmtUsd } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * 차트 프리미티브.
 *
 * dataviz 절차를 순서대로 지킨다: 형태 → 색의 역할 → 검증 → 마크 → 상호작용 → 접근성.
 *
 * - 카테고리 색은 `--color-cat-1..4` 고정 순서. 절대 순환시키지 않는다.
 *   검증 스크립트를 `--pairs all` 로 통과한 값이고 슬롯은 넷이 한계다.
 * - **축은 하나뿐이다.** 단위가 다른 두 측정치는 차트를 나눈다 — 이중 축은 만들지 않는다.
 * - 텍스트는 항상 텍스트 토큰을 입는다. 값·라벨·범례에 시리즈 색을 칠하지 않는다.
 * - 시리즈가 둘 이상이면 범례가 항상 있고, 표 대체 보기도 항상 있다.
 */

export const CAT = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
] as const;

const GRID = "var(--hair)";
const AXIS = "var(--line)";

export interface Series {
  key: string;
  label: string;
  values: number[];
}

/**
 * 값 포맷은 **이름으로** 넘긴다.
 *
 * 함수를 prop 으로 주면 서버 컴포넌트에서 클라이언트 차트로 넘어가지 못한다
 * (직렬화가 안 된다). 게다가 포맷은 로케일에 걸려 있으므로, 어차피 사전을
 * 아는 클라이언트 쪽에서 만드는 것이 맞다.
 */
export type NumFormat = "plain" | "usd" | "duration" | "tokens" | "percent";

function useFormat(kind: NumFormat = "plain"): (n: number) => string {
  const t = useT();
  return (n: number) => {
    switch (kind) {
      case "usd":
        return fmtUsd(n);
      case "duration":
        return fmtDuration(n, t);
      case "tokens":
        return fmtTokens(n);
      case "percent":
        return `${Math.round(n)}%`;
      default:
        return n.toLocaleString();
    }
  };
}

/* ── 프레임 — 제목·범례·표 토글을 한 곳에서 ─────────────────── */

export function ChartFrame({
  title,
  hint,
  series,
  labels,
  formatValue,
  children,
  className,
}: {
  title: string;
  hint?: string;
  series?: Series[];
  labels?: string[];
  formatValue?: NumFormat;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const [table, setTable] = useState(false);
  const multi = (series?.length ?? 0) >= 2;

  return (
    <section
      // 차트에는 묶음이 필요하지만 카드일 필요는 없다. 채움을 빼고 실선을 가늘게
      // 하면 페이지 바탕 위에 얹힌 영역으로 읽히고, 화면의 상자 무게가 내려간다.
      className={cn("rounded-lg border border-hair p-4", className)}
      aria-label={t("a11y.chartOf", { name: title })}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {hint && <p className="mt-1 text-xs leading-relaxed text-fg-3">{hint}</p>}
        </div>
        {series && series.length > 0 && (
          <button
            onClick={() => setTable((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-3 transition-colors duration-100 active:scale-[0.97] hover:border-line-2 hover:text-fg-2"
          >
            <Table2 className="h-3 w-3" aria-hidden />
            {table ? t("common.chartView") : t("common.tableView")}
          </button>
        )}
      </header>

      {/* 범례는 시리즈가 둘 이상이면 항상. 하나면 제목이 이미 이름을 말한다. */}
      {multi && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series!.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-fg-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: CAT[i % CAT.length] }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {table && series ? (
        <DataTable series={series} labels={labels ?? []} format={formatValue} />
      ) : (
        children
      )}
    </section>
  );
}

function DataTable({
  series,
  labels,
  format,
}: {
  series: Series[];
  labels: string[];
  format?: NumFormat;
}) {
  const fmt = useFormat(format);
  return (
    <div className="max-h-72 overflow-auto rounded-sm border border-hair">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-ink-750">
          <tr className="text-fg-3">
            <th className="px-3 py-2 text-left font-medium">—</th>
            {series.map((s) => (
              <th key={s.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l} className="border-t border-hair">
              <td className="px-3 py-1.5 text-fg-3 whitespace-nowrap">{l}</td>
              {series.map((s) => (
                <td key={s.key} className="px-3 py-1.5 text-right font-mono text-fg-2">
                  {fmt(s.values[i] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 시계열 — 라인/영역 + 크로스헤어 툴팁 ───────────────────── */

export function TimeSeries({
  series,
  labels,
  height = 168,
  area = false,
  format,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  area?: boolean;
  format?: NumFormat;
}) {
  const fmt = useFormat(format);
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);

  const paths = series.map((s) => ({
    ...s,
    d: s.values
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" "),
  }));

  if (n === 0) return <EmptyPlot height={height} />;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {area && (
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CAT[i % CAT.length]} stopOpacity="0.20" />
                <stop offset="100%" stopColor={CAT[i % CAT.length]} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
        )}

        {/* 격자는 뒤로 물러난다 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke={GRID}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(0)}
          y2={y(0)}
          stroke={AXIS}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {area &&
          paths.map((p, i) => (
            <path
              key={`a-${p.key}`}
              d={`${p.d} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`}
              fill={`url(#${uid}-${i})`}
            />
          ))}

        {paths.map((p, i) => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            stroke={CAT[i % CAT.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.t}
              y2={y(0)}
              stroke="var(--color-sky)"
              strokeWidth={1}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
            {series.map((s, i) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(s.values[hover] ?? 0)}
                r={4.5}
                fill={CAT[i % CAT.length]}
                stroke="var(--color-ink-800)"
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[11px] text-fg-3">
        <span>{labels[0]}</span>
        <span>{labels[n - 1]}</span>
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-ink-700 px-3 py-2 shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > n / 2 ? "-105%" : "5%"})`,
          }}
          role="status"
        >
          <p className="mb-1 text-[11px] text-fg-3">{labels[hover]}</p>
          {series.map((s, i) => (
            <p key={s.key} className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: CAT[i % CAT.length] }}
                aria-hidden
              />
              <span className="text-fg-3">{s.label}</span>
              <span className="ml-auto font-mono text-fg">{fmt(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 가로 막대 — 항목 간 크기 비교 ──────────────────────────── */

export function BarRows({
  rows,
  format,
  colorByIndex = false,
}: {
  rows: { label: string; value: number; note?: string }[];
  format?: NumFormat;
  colorByIndex?: boolean;
}) {
  const fmt = useFormat(format);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <EmptyPlot height={120} />;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-fg-2">{r.label}</span>
            <span className="shrink-0 font-mono text-fg">{fmt(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-[4px] bg-fill">
            <div
              className="h-full rounded-[4px]"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: colorByIndex ? CAT[i % CAT.length] : "var(--color-cat-1)",
              }}
            />
          </div>
          {r.note && <p className="mt-1 text-[11px] text-fg-3">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ── 히스토그램 — 분포 ──────────────────────────────────────── */

export function Histogram({
  bins,
  height = 140,
  colorIndex = 0,
}: {
  bins: { label: string; count: number }[];
  height?: number;
  colorIndex?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.count));
  if (!bins.length) return <EmptyPlot height={height} />;
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {bins.map((b, i) => (
          <button
            key={b.label}
            onMouseEnter={() => setHover(i)}
            className="relative flex-1 rounded-t-[4px] transition-opacity"
            style={{
              height: `${Math.max(2, (b.count / max) * 100)}%`,
              background: CAT[colorIndex % CAT.length],
              opacity: hover === null || hover === i ? 0.9 : 0.35,
            }}
            aria-label={`${b.label}: ${b.count}`}
          >
            {hover === i && (
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md border border-line bg-ink-700 px-2 py-1 text-[11px] whitespace-nowrap text-fg shadow-lg">
                {b.label} · {b.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-3">
        <span>{bins[0].label}</span>
        <span>{bins[bins.length - 1].label}</span>
      </div>
    </div>
  );
}

/* ── 스탯 타일 — 헤드라인 숫자 ──────────────────────────────── */

/**
 * 지표 줄 — 상자 하나에 값 여러 개.
 *
 * 값마다 카드를 주면 상자 수가 값 수와 같아지고, 그러면 눈이 숫자보다 테두리를
 * 먼저 센다. 묶음은 테두리 하나와 그 안의 실선으로 말하는 것으로 충분하다.
 */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-hair overflow-hidden rounded-lg border border-line bg-ink-800 lg:grid-cols-4 lg:divide-y-0">
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaGoodWhen = "up",
  spark,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaGoodWhen?: "up" | "down";
  spark?: number[];
  className?: string;
}) {
  const good = delta === undefined ? null : deltaGoodWhen === "up" ? delta >= 0 : delta <= 0;
  const Icon = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn("px-4 py-3", className)}>
      <p className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              good === null ? "text-fg-3" : good ? "text-fg-2" : "text-crit",
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <MiniSpark values={spark} className="mt-2.5 text-fg-3" />
      )}
    </div>
  );
}

function MiniSpark({ values, className }: { values: number[]; className?: string }) {
  const W = 100;
  const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (values.length - 1)) * W).toFixed(1)} ${(
          H - 2 - ((v - min) / span) * (H - 4)
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height: H }} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EmptyPlot({ height }: { height: number }) {
  const t = useT();
  return (
    <div
      className="flex items-center justify-center rounded-sm border border-dashed border-hair text-xs text-fg-3"
      style={{ height }}
    >
      {t("common.noData")}
    </div>
  );
}

/* ── 스코어 분포 헬퍼 ───────────────────────────────────────── */

export function useNumericBins(values: number[], count = 10) {
  return useMemo(() => {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const bins = Array.from({ length: count }, (_, i) => ({
      label: (min + (span * i) / count).toFixed(2),
      count: 0,
    }));
    for (const v of values) {
      const i = Math.min(count - 1, Math.floor(((v - min) / span) * count));
      bins[i].count++;
    }
    return bins;
  }, [values, count]);
}
