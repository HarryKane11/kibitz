"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, SkipForward } from "lucide-react";
import type { AnnotationQueue } from "@/lib/types";
import { useT } from "@/components/i18n-provider";
import { Card, Chip } from "@/components/page";
import { cn } from "@/lib/utils";
import { saveAnnotationQueue } from "@/lib/resource-actions";

/**
 * 어노테이션 작업대.
 *
 * 규칙은 "이 런이 낭비였다"까지 말할 수 있지만 "그래서 답이 쓸모 있었나"는
 * 사람만 말할 수 있다. 큐는 그 한 가지 판단만 받도록 좁게 만든다 —
 * 항목당 선택 하나. 화면이 넓어질수록 큐는 안 돌아간다.
 *
 * 제출 결과는 resource store에 즉시 저장된다. trace 원본과 분리해 두므로
 * 재수집하거나 trace를 갱신해도 사람의 판정은 사라지지 않는다.
 */
export function AnnotationWorkspace({ queue }: { queue: AnnotationQueue }) {
  const t = useT();
  const [items, setItems] = useState(queue.items);
  const [comment, setComment] = useState("");

  const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
  const done = items.length - pending.length;
  const current = pending[0];

  const submit = (value: string | null) => {
    if (!current) return;
    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === current.id
          ? {
              ...i,
              status: "done" as const,
              submittedValue: value ?? undefined,
              submittedComment: comment.trim() || undefined,
            }
          : i,
      );
      void saveAnnotationQueue({ ...queue, items: next });
      return next;
    });
    setComment("");
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        {/* 진행률 — 큐 작업은 끝이 보여야 계속된다 */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-fg-2">
              {t("annotation.progress", { done, total: items.length })}
            </span>
            <span className="font-mono text-fg-3">
              {Math.round((done / items.length) * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fill">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(done / items.length) * 100}%`,
                background: "var(--color-cat-1)",
              }}
            />
          </div>
        </div>

        {current ? (
          <Card>
            <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">
              {t("annotation.reviewing")}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{current.traceTitle}</h2>
            <p className="mt-2 rounded-r-sm border-l-2 border-warn bg-warn/[0.055] px-3 py-2 text-sm leading-relaxed text-fg-2">
              {current.reasonKind ? t(`note.${current.reasonKind}`) : t("annotation.flaggedByStatus")}
            </p>
            <Link
              href={`/traces/${current.traceId}`}
              className="mt-3 inline-block font-mono text-xs text-fg-3 transition-colors duration-100 active:scale-[0.97] hover:text-fg-2"
            >
              {current.traceId} →
            </Link>

            <div className="mt-5 border-t border-hair pt-4">
              <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
                {t("annotation.yourScore")} · {current.scoreName}
              </p>
              <div className="flex flex-wrap gap-2">
                {current.options.map((o) => (
                  <button
                    key={o}
                    onClick={() => submit(o)}
                    className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-fg-2 transition-colors duration-100 active:scale-[0.97] hover:border-line-3 hover:text-fg"
                  >
                    {o}
                  </button>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-xs text-fg-3">{t("annotation.optionalComment")}</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-md border border-line bg-ink-750 px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus:border-line-3 focus:outline-none"
                />
              </label>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => submit(null)}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-3 transition-colors duration-100 active:scale-[0.97] hover:border-line-2 hover:text-fg-2"
                >
                  <SkipForward className="h-3 w-3" aria-hidden />
                  {t("annotation.skip")}
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="flex items-center gap-2 text-sm text-fg-2">
              <Check className="h-4 w-4" aria-hidden />
              {t("annotation.nothingLeft")}
            </p>
          </Card>
        )}
      </div>

      <aside>
        <p className="mb-2 text-xs font-medium tracking-wide text-fg-3 uppercase">
          {t("annotation.queue")}
        </p>
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li
              key={i.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                i.id === current?.id
                  ? "border-line-2 bg-ink-600"
                  : "border-hair text-fg-3",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{i.traceTitle}</span>
              {i.status === "done" ? (
                <Chip>{i.submittedValue ?? t("annotation.skip")}</Chip>
              ) : (
                <span className="shrink-0 text-fg-3">{t("annotation.pending")}</span>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
