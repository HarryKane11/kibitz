import type { RunStatus, Turn, Verdict } from "@/lib/types";
import type { Translate } from "@/lib/i18n/shared";

/**
 * 색은 여기서만 결정된다.
 *
 * 정상(good)과 사람 개입(human)은 무채색이다. 성공은 기본값이고,
 * 기본값은 소리치지 않는다. 색이 보이는 곳만 보면 되게 만드는 것이 목적이다.
 */
export const VERDICT_FILL: Record<Verdict, string> = {
  good: "var(--color-turn-good)",
  waste: "var(--color-warn)",
  error: "var(--color-crit)",
  human: "var(--color-turn-wait)",
};

/** 텍스트·글리프용 Tailwind 클래스 */
export const VERDICT_TEXT: Record<Verdict, string> = {
  good: "text-fg-3",
  waste: "text-warn",
  error: "text-crit",
  human: "text-fg-3",
};

/** 상태 라벨은 사전에서 온다 — 여기서는 색만 정한다. */
export const STATUS_TEXT: Record<RunStatus, string> = {
  ok: "text-fg-2",
  degraded: "text-warn",
  failed: "text-crit",
};

/**
 * 턴 제목.
 *
 * 모델이 스스로 쓴 문장이 있으면 그것이 제목이다 — 번역하지 않는다.
 * 우리가 붙인 이름(사용자 요청 등)일 때만 사전을 거친다.
 */
export function turnTitle(turn: Turn, t: Translate): string {
  if (!turn.titleKey) return turn.title;
  return t(`turn.${turn.titleKey}`, { tool: turn.titleTool ?? "" });
}

/** 호출 결과 한 마디. 없으면 표시하지 않는다. */
export function turnResult(turn: Turn, t: Translate): string | undefined {
  switch (turn.resultKey) {
    case undefined:
      return undefined;
    case "records":
      return t("turn.resultRecords", { n: turn.resultCount ?? 0 });
    case "ok":
      return t("turn.resultOk");
    case "empty":
      return t("turn.resultEmpty");
    case "sent":
      return t("turn.resultSent");
  }
}

/** 지연·비용·컨텍스트 렌즈용 열지도. 무채색 → sky 계단. */
export function heat(value: number, max: number): string {
  const r = Math.min(1, Math.max(0, value / max));
  return `rgb(${Math.round(44 + r * 67)}, ${Math.round(50 + r * 149)}, ${Math.round(58 + r * 197)})`;
}

/**
 * 실제 런은 수십 분짜리도 있다. `1336.0s` 같은 표기는 읽히지 않는다.
 *
 * 단위는 기본이 영어이고, `t` 를 넘기면 사전의 단위 문자열을 쓴다.
 * 포매터가 사전에 직접 의존하면 서버/클라이언트 어디서든 못 쓰게 되므로
 * 주입으로 받는다.
 */
type UnitT = (k: "units.ms" | "units.sec" | "units.minSec" | "units.hourMin", v?: Record<string, string | number>) => string;

export function fmtDuration(ms: number, t?: UnitT): string {
  if (ms < 1000) return t ? t("units.ms", { n: ms }) : `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return t ? t("units.sec", { n: s.toFixed(1) }) : `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  if (m < 60) return t ? t("units.minSec", { m, s: rs }) : `${m}m ${rs}s`;
  return t ? t("units.hourMin", { h: Math.floor(m / 60), m: m % 60 }) : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

export const fmtUsd = (n: number) =>
  n === 0 ? "$0" : n < 0.001 ? "<$0.001" : `$${n.toFixed(3)}`;

type TimeT = (k: "time.justNow" | "time.minutesAgo" | "time.hoursAgo" | "time.daysAgo", v?: Record<string, string | number>) => string;

export function relTime(
  iso: string,
  t?: TimeT,
  now = Date.parse("2026-07-26T09:14:02+09:00"),
): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const m = Math.round(diff / 60000);
  if (m < 1) return t ? t("time.justNow") : "just now";
  if (m < 60) return t ? t("time.minutesAgo", { n: m }) : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return t ? t("time.hoursAgo", { n: h }) : `${h}h ago`;
  const d = Math.floor(h / 24);
  return t ? t("time.daysAgo", { n: d }) : `${d}d ago`;
}
