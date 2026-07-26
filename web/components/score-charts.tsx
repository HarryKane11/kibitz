"use client";

import { BarRows, Histogram, useNumericBins } from "@/components/charts";

/**
 * 스코어 하나의 분포.
 *
 * 수치형은 히스토그램, 범주형은 가로 막대 — 형태를 데이터의 일에 맞춘다.
 * 범주는 카테고리 색을 순서대로 받되, 4개를 넘기면 색이 아니라 길이로만 읽힌다.
 */
export function ScoreCharts({
  numeric,
  values,
  categories,
  distributionTitle,
}: {
  numeric: boolean;
  values: number[];
  categories: { label: string; count: number }[];
  distributionTitle: string;
}) {
  const bins = useNumericBins(values, 10);

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
        {distributionTitle}
      </p>
      {numeric ? (
        <Histogram bins={bins} colorIndex={0} height={120} />
      ) : (
        <BarRows
          rows={categories.sort((a, b) => b.count - a.count).map((c) => ({
            label: c.label,
            value: c.count,
          }))}
          colorByIndex={categories.length <= 4}
        />
      )}
    </div>
  );
}
