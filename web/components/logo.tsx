import { cn } from "@/lib/utils";

/**
 * K + variation fork.
 *
 * 세로줄은 기록된 trace, 두 갈래는 실제 선택과 반사실이다. 열린 노드는 검토할
 * 대안, 채운 노드는 에이전트가 실제로 택한 경로다. 16px에서도 실루엣이 남도록
 * 이미지 생성으로 탐색한 조형을 단순한 SVG 세 획으로 다시 그렸다.
 */
export function KibitzMark({
  className,
  accent = "var(--color-brand)",
}: {
  className?: string;
  accent?: string;
  /** 이전 API 호환. 새 마크는 배경을 뚫어 쓰므로 표면색이 필요 없다. */
  surface?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-6 w-6", className)}
      fill="none"
      aria-hidden
    >
      <path
        d="M6 4.5V27.5"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M8 16C12.5 15.2 17.2 10.1 24.5 5.5"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      <path
        d="M8 16C13.3 17.1 17.3 23.6 24.5 26.5"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      <circle cx="25.5" cy="5" r="3" stroke={accent} strokeWidth="2.5" />
      <circle cx="25.5" cy="27" r="3.25" fill="currentColor" />
      <circle cx="8" cy="16" r="2.25" fill={accent} />
    </svg>
  );
}

/** 마크 + 워드마크. */
export function KibitzLogo({
  className,
  markClassName,
  accent,
  surface,
}: {
  className?: string;
  markClassName?: string;
  accent?: string;
  surface?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <KibitzMark className={markClassName} accent={accent} surface={surface} />
      <span className="text-[16px] font-bold tracking-[-0.045em]">Kibitz</span>
    </span>
  );
}
