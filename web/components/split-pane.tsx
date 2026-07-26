"use client";

import { useCallback, useRef, useState } from "react";
import { usePersisted } from "@/lib/persisted";
import { cn } from "@/lib/utils";

/**
 * 좌우 분할 + 드래그 리사이즈.
 *
 * 크래프트 규칙 세 가지를 지킨다:
 *  1. **pointer-down 에 즉시 반응** (release 아님). 지연이 있으면 잡은 느낌이 안 난다.
 *  2. **1:1 추적** — `setPointerCapture` 로 포인터가 요소를 벗어나도 계속 따라간다.
 *     중심으로 스냅하지 않고 잡은 지점의 offset 을 존중한다.
 *  3. **드래그 중 트랜지션 없음** — 있으면 손가락보다 늦게 따라와 고무처럼 느껨진다.
 *
 * 키보드로도 움직인다 (`role="separator"` + 화살표). 더블클릭으로 초기값 복귀.
 */
export function SplitPane({
  left,
  right,
  initial = 46,
  min = 22,
  max = 74,
  storageKey,
  label,
  className,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  /** 좌측 폭 (%) */
  initial?: number;
  min?: number;
  max?: number;
  /** 주면 localStorage 에 폭을 기억한다 */
  storageKey?: string;
  label: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pct, setPct] = usePersisted(storageKey ?? "kibitz.splitPane", initial);

  const commit = useCallback(
    (next: number) => setPct(Math.min(max, Math.max(min, next))),
    [min, max, setPct],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !wrap.current) return;
    const box = wrap.current.getBoundingClientRect();
    commit(((e.clientX - box.left) / box.width) * 100);
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  return (
    <div
      ref={wrap}
      className={cn("flex min-h-0 items-stretch", className)}
      // 드래그 중에는 텍스트 선택과 커서 깜빡임을 막는다
      style={dragging ? { userSelect: "none", cursor: "col-resize" } : undefined}
    >
      <div className="min-w-0 shrink-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => commit(initial)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") commit(pct - (e.shiftKey ? 6 : 2));
          else if (e.key === "ArrowRight") commit(pct + (e.shiftKey ? 6 : 2));
          else if (e.key === "Home") commit(initial);
          else return;
          e.preventDefault();
        }}
        className={cn(
          "group relative w-px shrink-0 cursor-col-resize bg-fill outline-none",
          "focus-visible:bg-sky",
        )}
      >
        {/* 히트 영역은 보이는 선보다 넓다 — 1px 선을 정확히 집는 건 불가능하다 */}
        <span className="absolute inset-y-0 -left-2 -right-2 z-10" aria-hidden />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 -left-px -right-px transition-colors duration-100",
            dragging ? "bg-sky" : "bg-transparent group-hover:bg-fill-2",
          )}
        />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
