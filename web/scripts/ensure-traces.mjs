/**
 * `lib/mock/traces.json` 이 없으면 샘플을 복사한다.
 *
 * 그 파일은 **gitignore 된다** — 인제스터가 실제 세션 기록을 거기 쓰기 때문이다.
 * 프롬프트·파일 경로·프로젝트명이 그대로 들어가므로 저장소에 올라가면 안 된다.
 * 그런데 `lib/data.ts` 가 이 파일을 정적 import 하므로 없으면 빌드가 깨진다.
 * 새로 클론한 사람도 바로 `pnpm dev` 가 되게 여기서 빈 샘플을 깔아 준다.
 */
import { copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "lib", "mock", "traces.json");
const sample = join(here, "..", "lib", "mock", "traces.sample.json");

try {
  await access(target);
} catch {
  await copyFile(sample, target);
  console.log("ensure-traces: traces.json 이 없어 샘플을 복사했습니다.");
  console.log("  실제 세션을 넣으려면: uv run --project agent python -m kibitz_ingest.cli --source all");
}
