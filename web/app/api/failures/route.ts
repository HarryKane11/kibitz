import { NextResponse } from "next/server";
import { listRuns } from "@/lib/data";
import { authorizeRead, intParam, projectScope, verdictOf } from "@/lib/api";
import type { FailureKind } from "@/lib/types";

/**
 * GET /api/failures?kind=repeated-call&source=codex&limit=50
 *
 * 모든 트레이스의 판정을 한 줄로 늘어놓는다. "내가 지난주에 어디서 헛돌았나"에
 * 답하려면 트레이스를 하나씩 열게 하지 말고 이 목록을 줘야 한다.
 */
export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as FailureKind | null;
  const source = url.searchParams.get("source");
  const limit = intParam(url.searchParams.get("limit"), 100, 1000);

  const project = projectScope(req);
  const runs = (await listRuns()).filter((run) => !project || run.project === project);
  const all = runs
    .filter((r) => !source || r.source === source)
    .flatMap((r) => r.turns.filter((t) => t.note).map((t) => verdictOf(r, t)))
    .filter((v) => !kind || v.kind === kind);

  // 아낄 수 있는 토큰이 큰 것부터 — 어디를 먼저 고칠지가 이 목록의 용도다.
  all.sort((a, b) => b.wouldSave.tokens - a.wouldSave.tokens);

  const byKind: Record<string, number> = {};
  for (const v of all) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;

  return NextResponse.json({
    count: all.length,
    byKind,
    verdicts: all.slice(0, limit),
  });
}
