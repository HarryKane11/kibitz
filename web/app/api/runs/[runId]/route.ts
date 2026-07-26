import { NextResponse } from "next/server";
import { getRun, sumCounterfactuals } from "@/lib/data";
import { buildTree } from "@/lib/tree";
import { authorizeRead, observationOf, projectScope, runSummary, verdictOf } from "@/lib/api";

/**
 * GET /api/runs/:id
 *
 * 트레이스 하나 — 요약 + 관측 목록 + 판정.
 *
 * `?full=1` 이면 관측의 출력 본문까지 넣는다. 기본으로는 빼 둔다: 에이전트가
 * 자기 과거를 훑을 때 대개 필요한 것은 구조와 판정이고, 본문을 항상 실어 보내면
 * 프롬프트가 컨텍스트를 채우고 비용이 된다.
 */
export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const { runId } = await ctx.params;
  const run = await getRun(runId);
  const project = projectScope(req);
  if (!run || (project && run.project !== project)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const full = new URL(req.url).searchParams.get("full") === "1";
  const roots = buildTree(run.turns);
  const saved = sumCounterfactuals(run.turns);

  return NextResponse.json({
    ...runSummary(run),
    /** 요청 묶음 — 사용자 요청 하나가 그 아래 작업 전체를 지배한다 */
    requests: roots
      .filter((n) => n.turn.obsType === "chain")
      .map((n) => ({
        observation: n.turn.index,
        text: n.turn.utterance ?? n.turn.output,
        children: n.children.length,
        durationMs: n.rollup.durationMs,
        tokens: n.rollup.tokens,
        costUsd: Number(n.rollup.costUsd.toFixed(4)),
        errors: n.rollup.errors,
        wastes: n.rollup.wastes,
      })),
    observations: run.turns.map((t) =>
      full ? { ...observationOf(t), output: t.output.slice(0, 4000) } : observationOf(t),
    ),
    verdicts: run.turns.filter((t) => t.note).map((t) => verdictOf(run, t)),
    /** 판정을 전부 고쳤다면 아꼈을 것 — 판정마다의 반사실을 합친 값 */
    wouldSave: { turns: saved.turns, ms: saved.ms, tokens: saved.tokens },
  });
}
