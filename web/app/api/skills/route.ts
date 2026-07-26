import { NextResponse } from "next/server";
import { listSkillCandidates } from "@/lib/data";
import { authorizeRead, projectScope } from "@/lib/api";

/**
 * GET /api/skills
 *
 * 세션을 넘어 반복되는 패턴 = 스킬 후보. 계산이지 추측이 아니므로 후보마다
 * 몇 개 세션에서 몇 번 나왔고 토큰을 얼마나 썼는지가 함께 온다.
 */
export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const candidates = await listSkillCandidates(projectScope(req));
  return NextResponse.json({
    count: candidates.length,
    note:
      "Ranked by how many distinct sessions each pattern spans. " +
      "A pattern confined to one session is that session's problem, not a skill.",
    candidates,
  });
}
