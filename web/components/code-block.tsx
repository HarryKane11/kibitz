"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * 타이틀바 달린 코드 블록.
 *
 * 파일명이 붙어 있으면 "이걸 어디에 두는지"가 함께 전달된다 — 코드만 있는 블록은
 * 매번 그걸 따로 설명해야 한다.
 *
 * 신호등 점은 그리지 않는다. macOS 창을 흉내내는 장식이고, 이 코드가 실제로 도는
 * 곳은 터미널이지 창이 아니다.
 */
export function CodeBlock({
  filename,
  code,
  className,
}: {
  filename: string;
  code: string;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <figure
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-lg border border-line bg-ink-800",
        className,
      )}
    >
      <figcaption className="flex items-center gap-2 border-b border-hair px-3.5 py-2">
        <span className="font-mono text-[11px] text-fg-3">{filename}</span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          aria-label={t("common.copy")}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-fg-3 transition-colors duration-100 hover:bg-fill hover:text-fg-2 active:scale-[0.97]"
        >
          {copied ? (
            <Check className="h-3 w-3 text-fg" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-fg-2">
        {code}
      </pre>
    </figure>
  );
}
