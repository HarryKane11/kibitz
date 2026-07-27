import "server-only";
import { join } from "node:path";

/**
 * 디스크 경로만 있는 모듈. **아무것도 import 하지 않는다.**
 *
 * 이 파일이 따로 있는 이유는 순환 참조 때문이다. `store.ts` 가 인덱스를 갱신하려고
 * `index-db.ts` 를 부르고, `index-db.ts` 는 경로를 알려고 `store.ts` 의 `DATA_DIR` 를
 * 봤다. 그러면 모듈 평가 순서에 따라
 *
 *   ReferenceError: Cannot access 'DATA_DIR' before initialization
 *
 * 이 난다. 실제로 났고, 라우트가 전부 500 을 내면서도 응답은 빨라서 성능 측정이
 * 통과한 것처럼 보였다 — 그게 이 버그의 가장 나쁜 점이었다.
 *
 * 경로는 상수이고 누구에게도 의존하지 않는다. 그러니 의존성이 없는 자리에 둔다.
 */

/** 완성된 런. compose 는 볼륨으로, 로컬은 그냥 폴더로 쓴다. */
export const DATA_DIR =
  process.env.KIBITZ_DATA_DIR ??
  join(/* turbopackIgnore: true */ process.cwd(), ".kibitz", "traces");

/** 진행 중·완료된 트레이스의 원시 스팬 (append-only). */
export const SPAN_DIR = join(/* turbopackIgnore: true */ DATA_DIR, "..", "spans");

/** 런 요약 인덱스. 파생이므로 지워도 파일에서 다시 만든다. */
export const INDEX_DB = join(/* turbopackIgnore: true */ DATA_DIR, "..", "index.db");

/** 모델이 쓴 개선 제안. 계산된 트레이스와 **자리를 나눈다** — lib/analysis/store.ts 참고. */
export const ANALYSIS_DIR = join(/* turbopackIgnore: true */ DATA_DIR, "..", "analyses");
