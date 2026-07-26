import "server-only";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Run } from "@/lib/types";

/**
 * 런타임 트레이스 저장소.
 *
 * SDK 가 보낸 트레이스는 **빌드 시점에 없다.** 정적 import 만으로는 실행 중에 들어온
 * 것을 볼 수 없으므로, 디렉터리를 읽는 층을 따로 둔다.
 *
 * 디스크에 파일로 둔다 — Postgres/ClickHouse 가 아니다. 셀프호스팅하는 사람이
 * 처음에 감당해야 할 것을 하나로 줄이는 게 낫고, 파일이면 `cat` 으로 확인하고
 * `rm` 으로 지울 수 있다. 규모가 커지면 이 파일 하나를 DB 어댑터로 바꾸면 되고
 * 화면은 손대지 않는다 (`lib/data.ts` 가 유일한 소비자다).
 *
 * 읽기는 동기다. 서버 컴포넌트에서 부르고, 트레이스 수가 수천 단위일 때 파일 읽기는
 * 렌더 한 번보다 싸다. async 로 만들면 `allRuns()` 를 부르는 모든 곳이 async 가 되어
 * 파생 엔티티까지 전부 물든다.
 */

/** 기본 위치. compose 는 볼륨으로, 로컬은 그냥 폴더로 쓴다. */
export const DATA_DIR =
  process.env.KIBITZ_DATA_DIR ??
  join(/*turbopackIgnore: true*/ process.cwd(), ".kibitz", "traces");

function isRun(v: unknown): v is Run {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<Run>;
  return (
    typeof r.id === "string" &&
    Array.isArray(r.turns) &&
    typeof r.score === "object" &&
    r.score !== null
  );
}

/**
 * 저장소의 모든 트레이스.
 *
 * 망가진 파일 하나가 화면을 죽이면 안 된다 — 실패한 파일은 건너뛰고 이름만 경고한다.
 * 트레이스를 못 읽는 것보다 "그 트레이스만 안 보이는" 쪽이 낫다.
 */
export function loadStoredRuns(): Run[] {
  if (!existsSync(/* turbopackIgnore: true */ DATA_DIR)) return [];
  const out: Run[] = [];
  for (const name of readdirSync(/* turbopackIgnore: true */ DATA_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(
          /* turbopackIgnore: true */ join(
            /* turbopackIgnore: true */ DATA_DIR,
            name,
          ),
          "utf8",
        ),
      );
      // 파일 하나에 트레이스 하나, 또는 배열로 여러 개.
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (isRun(item)) out.push(item);
        else console.warn(`[kibitz] ${name}: 트레이스 모양이 아닙니다 — 건너뜁니다`);
      }
    } catch (err) {
      console.warn(`[kibitz] ${name}: 읽을 수 없습니다 — 건너뜁니다`, err);
    }
  }
  return out;
}

/**
 * id 로 하나 저장. 같은 id 면 덮어쓴다 — 재전송이 멀등해야 한다.
 *
 * 같은 디렉터리 안의 임시 파일을 rename하므로 독자는 절반만 써진 JSON을 보지 않는다.
 * 공유 RWX volume 위에서 여러 stateless web replica가 서로 다른 trace를 동시에 써도 된다.
 */
export function storeRun(run: Run): void {
  mkdirSync(/* turbopackIgnore: true */ DATA_DIR, { recursive: true });
  // 파일명에 id 가 들어가므로 경로 조작을 막는다. id 는 우리가 만든 것이지만
  // 이 함수는 HTTP 로도 불린다.
  const safe = run.id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
  if (!safe) throw new Error("빈 트레이스 id");
  const target = join(/* turbopackIgnore: true */ DATA_DIR, `${safe}.json`);
  const temporary = join(
    /* turbopackIgnore: true */ DATA_DIR,
    `.${safe}.${randomUUID()}.tmp`,
  );
  writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify(run), "utf8");
  renameSync(/* turbopackIgnore: true */ temporary, target);
}
