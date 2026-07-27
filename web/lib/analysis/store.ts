import "server-only";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ANALYSIS_DIR } from "@/lib/paths";
import type { AnalyzeOk, SavedAnalysis } from "@/lib/analysis/catalog";

/**
 * 분석 결과 저장소.
 *
 * **처음엔 저장하지 않았다.** 이유는 "모델이 쓴 글이 계산된 판정과 같은 저장소에
 * 들어가면 6개월 뒤에 둘을 구분할 사람이 없다" 였다. 그 걱정은 맞지만 결론이 틀렸다 —
 * 새로고침 한 번에 사용자가 돈과 시간을 들여 만든 것이 사라지는 것은 원칙이 아니라
 * 버그다. 특히 CLI 계정으로 돌린 분석은 몇십 초가 걸린다.
 *
 * 구분은 저장을 안 하는 방식이 아니라 **자리를 나누는 방식**으로 지킨다:
 *
 *   .kibitz/traces/    계산된 트레이스와 판정  ← 근거
 *   .kibitz/analyses/  모델이 쓴 제안          ← 검증되지 않은 글
 *
 * 파일이 다르고, 레코드마다 `createdAt`·`provider`·`model` 이 붙고, 화면은 여전히
 * 점선 테두리와 "검증되지 않음" 라벨을 붙인다. 6개월 뒤에 봐도 언제 어느 모델이
 * 쓴 것인지 알 수 있다 — 그게 원래 걱정하던 것의 진짜 해결이다.
 *
 * 트레이스당 최근 몇 개만 남긴다. 무한히 쌓이면 그것도 관리 안 되는 데이터가 된다.
 */

const KEEP_PER_RUN = 10;

function fileFor(runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
  if (!safe) throw new Error("빈 runId");
  return join(/* turbopackIgnore: true */ ANALYSIS_DIR, `${safe}.json`);
}

/** 이 트레이스의 저장된 분석. 최신이 먼저. */
export function loadAnalyses(runId: string): SavedAnalysis[] {
  const path = fileFor(runId);
  if (!existsSync(/* turbopackIgnore: true */ path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedAnalysis[])
      .filter((a) => a && typeof a.id === "string" && Array.isArray(a.suggestions))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch (err) {
    // 읽을 수 없는 파일 하나가 화면을 죽이면 안 된다.
    console.warn(`[kibitz] 분석 기록을 읽을 수 없습니다 (${runId}):`, err);
    return [];
  }
}

function write(runId: string, list: SavedAnalysis[]): void {
  mkdirSync(/* turbopackIgnore: true */ ANALYSIS_DIR, { recursive: true });
  const target = fileFor(runId);
  // 같은 디렉터리의 임시 파일에 쓰고 rename — 독자가 절반만 쓰인 JSON 을 보지 않는다.
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify(list), "utf8");
  renameSync(/* turbopackIgnore: true */ temporary, target);
}

/** 새 결과를 앞에 붙인다. 반환값은 저장된 레코드. */
export function saveAnalysis(
  runId: string,
  result: AnalyzeOk,
  createdAt: string,
): SavedAnalysis {
  const record: SavedAnalysis = {
    id: `an_${randomUUID().slice(0, 8)}`,
    runId,
    createdAt,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    schemaEnforced: result.schemaEnforced,
    citationRule: result.citationRule,
    summary: result.summary,
    suggestions: result.suggestions,
    brief: result.brief,
  };
  try {
    const next = [record, ...loadAnalyses(runId)].slice(0, KEEP_PER_RUN);
    write(runId, next);
  } catch (err) {
    // 저장 실패가 분석 자체를 실패로 만들면 안 된다 — 화면에는 이미 결과가 있다.
    console.warn(`[kibitz] 분석을 저장하지 못했습니다 (${runId}):`, err);
  }
  return record;
}

export function deleteAnalysis(runId: string, id: string): SavedAnalysis[] {
  const next = loadAnalyses(runId).filter((a) => a.id !== id);
  try {
    write(runId, next);
  } catch (err) {
    console.warn(`[kibitz] 분석을 지우지 못했습니다 (${runId}):`, err);
  }
  return next;
}
