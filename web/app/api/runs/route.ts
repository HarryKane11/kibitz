import { NextResponse } from "next/server";
import { queryRuns } from "@/lib/data";
import { fromParams } from "@/lib/query";
import { authorizeRead, intParam, projectScope, runSummary } from "@/lib/api";

/**
 * GET /api/runs
 *
 * 트레이스 목록. 화면의 필터와 **같은 쿼리 문법**을 쓴다 (`?f=status~is~failed`),
 * 그래서 화면에서 만든 링크를 그대로 API 에 던질 수 있다. 필터 구현을 두 벌 두면
 * 화면과 API 의 답이 달라진다.
 */
export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const query = fromParams((k) => url.searchParams.get(k) ?? undefined);
  const limit = intParam(url.searchParams.get("limit"), 50, 500);

  const project = projectScope(req);
  const runs = (await queryRuns(query)).filter((run) => !project || run.project === project);
  return NextResponse.json({
    count: runs.length,
    returned: Math.min(runs.length, limit),
    runs: runs.slice(0, limit).map(runSummary),
  });
}
