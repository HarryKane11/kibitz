import "server-only";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { DATA_DIR, SPAN_DIR } from "@/lib/paths";
import type { SpanRecord } from "@/lib/otlp";

/**
 * 스팬 저장소 — 실시간 트레이싱이 여기에 달려 있다.
 *
 * **왜 필요했나.** OTLP 수집기는 배치마다 완성된 `Run` 을 만들어 파일을 덮어썼다.
 * 완료된 트레이스를 한 번에 받을 때는 맞지만, 돌고 있는 에이전트는 `BatchSpanProcessor`
 * 가 5초마다 flush 하므로 두 번째 배치가 첫 배치를 **지웠다**. 즉 살아 있는 런을
 * 감시하면 마지막 5초만 남았다. 기능이 없는 게 아니라 데이터가 사라지고 있었다.
 *
 * 그래서 저장 단위를 Run 이 아니라 **스팬**으로 내린다:
 *
 *   1. 배치가 오면 스팬을 JSONL 에 덧붙인다 (append 는 원자적이고 싸다).
 *   2. 지금까지의 전체 스팬으로 Run 을 다시 만든다.
 *   3. 같은 spanId 가 다시 오면 나중 것이 이긴다 — OTLP 는 재전송을 허용한다.
 *
 * 덧붙이기라서 수집이 **멱등**해진다. 같은 배치를 두 번 보내도 결과가 같다.
 */

/** 파일명에 traceId 가 들어간다. HTTP 로 들어온 값이므로 경로 조작을 막는다. */
function fileFor(traceId: string): string {
  const safe = traceId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
  if (!safe) throw new Error("빈 traceId");
  return join(/* turbopackIgnore: true */ SPAN_DIR, `${safe}.jsonl`);
}

/** 배치를 덧붙인다. 반환값은 이 트레이스의 전체 스팬. */
export function appendSpans(traceId: string, records: SpanRecord[]): SpanRecord[] {
  mkdirSync(/* turbopackIgnore: true */ SPAN_DIR, { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  appendFileSync(fileFor(traceId), lines, "utf8");
  return readSpans(traceId);
}

/**
 * 이 트레이스의 스팬 전체. 같은 spanId 는 마지막 것만 남긴다.
 *
 * 깨진 줄은 건너뛴다 — 쓰는 중에 프로세스가 죽으면 마지막 줄이 잘릴 수 있고,
 * 그 한 줄 때문에 트레이스 전체를 못 읽는 것이 더 나쁘다.
 */
export function readSpans(traceId: string): SpanRecord[] {
  const path = fileFor(traceId);
  if (!existsSync(path)) return [];
  const byId = new Map<string, SpanRecord>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as SpanRecord;
      const id = record.span?.spanId;
      if (id) byId.set(id, record);
    } catch {
      continue;
    }
  }
  return [...byId.values()];
}

export function hasSpans(traceId: string): boolean {
  return existsSync(fileFor(traceId));
}

/**
 * 수집 상태의 버전.
 *
 * 화면이 "새로 들어온 게 있나"를 물을 때 쓴다. 파일 mtime 의 최댓값과 개수로 만든다 —
 * 스팬을 세거나 파싱하지 않으므로 2초마다 불러도 부담이 없다.
 */
export function ingestVersion(): { version: string; traces: number } {
  const dirs = [SPAN_DIR, DATA_DIR];
  let newest = 0;
  let count = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      try {
        const s = statSync(join(/* turbopackIgnore: true */ dir, name));
        if (!s.isFile()) continue;
        count += 1;
        newest = Math.max(newest, s.mtimeMs);
      } catch {
        continue;
      }
    }
  }
  return { version: `${Math.round(newest)}-${count}`, traces: count };
}
