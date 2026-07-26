import { NextResponse } from "next/server";
import { loadStoredRuns, storeRun } from "@/lib/store";
import type { Run } from "@/lib/types";
import { authorizeIngest, authorizeRead, projectScope } from "@/lib/api";

/**
 * 트레이스 수집 엔드포인트.
 *
 *   POST /api/traces   트레이스 하나 또는 배열
 *   GET  /api/traces   저장된 트레이스 요약
 *
 * SDK 가 **완성된 트레이스**를 보낸다. 원시 이벤트를 받아 여기서 탐지를 돌리지
 * 않는 이유: 탐지 규칙은 `agent/kibitz_ingest` 에 한 벌만 있고, 그걸 TypeScript 로
 * 옮기면 두 구현이 생겨 반드시 갈라진다. SDK 가 같은 Python 코드를 import 해서
 * 트레이스를 만들고, 서버는 저장만 한다.
 *
 * 인증은 선택이다. `KIBITZ_INGEST_TOKEN` 이 있으면 `Authorization: Bearer` 를 요구한다.
 * 없으면 열려 있다 — 로컬에서 혼자 쓰는 경우가 대부분이고, 토큰을 강제하면 첫 5분이
 * 설정 작업이 된다. **네트워크에 노출한다면 반드시 설정해야 한다** (docs/security.md).
 */

const MAX_BYTES = 8 * 1024 * 1024;

function looksLikeRun(v: unknown): v is Run {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<Run>;
  return typeof r.id === "string" && r.id.length > 0 && Array.isArray(r.turns);
}

export async function POST(req: Request) {
  const denied = authorizeIngest(req);
  if (denied) return denied;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `payload too large (${raw.length} > ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const scopedProject = projectScope(req);
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const item of list) {
    if (!looksLikeRun(item)) {
      rejected.push("missing id or turns");
      continue;
    }
    try {
      storeRun(scopedProject ? { ...item, project: scopedProject } : item);
      accepted.push(item.id);
    } catch (err) {
      rejected.push(`${item.id}: ${err instanceof Error ? err.message : "write failed"}`);
    }
  }

  return NextResponse.json(
    { accepted, rejected },
    { status: rejected.length && !accepted.length ? 400 : 200 },
  );
}

export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;
  const scopedProject = projectScope(req);
  // 트레이스 본문은 돌려주지 않는다 — 목록 확인용이고, 전체를 실어 보내면
  // 프롬프트 내용이 의도치 않게 흘러나갈 수 있다.
  const runs = loadStoredRuns()
    .filter((run) => !scopedProject || run.project === scopedProject)
    .map((r) => ({
    id: r.id,
    source: r.source,
    agent: r.agent,
    startedAt: r.startedAt,
    turns: r.turns.length,
    accuracy: r.score.accuracy,
    }));
  return NextResponse.json({ count: runs.length, runs });
}
