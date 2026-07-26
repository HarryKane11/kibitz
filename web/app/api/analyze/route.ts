import { NextResponse } from "next/server";
import { authorizeRead, projectScope } from "@/lib/api";
import { getRun } from "@/lib/data";
import { briefPreview, providerStatuses, runAnalysis } from "@/lib/analysis/run";
import { CITATION_RULE } from "@/lib/analysis/suggest";
import type { AnalyzeInput } from "@/lib/analysis/catalog";

/**
 * BYOK 분석 — 스크립트·MCP 용 입구. 화면은 서버 액션(`lib/analysis/actions.ts`)을 쓴다.
 *
 *   GET  /api/analyze                     제공자 상태 (`?probe=1` 이면 ollama 에 물어본다)
 *   GET  /api/analyze?runId=cc_82ec12     + 보낼 브리프 전문. 모델을 부르지 않으므로 무료다.
 *   POST /api/analyze                     실제 분석
 *
 * **탐지는 여기에 없다.** 판정은 이미 `agent/kibitz_ingest` 의 여섯 규칙이 계산했고,
 * 이 엔드포인트는 그 결과를 놓고 "그래서 무엇을 바꿔야 하나"만 묻는다. 모델을 끄면
 * 제품의 나머지 전부가 그대로 동작한다.
 */

export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const providers = await providerStatuses(url.searchParams.get("probe") === "1");

  if (!runId) return NextResponse.json({ providers, citationRule: CITATION_RULE });
  const project = projectScope(req);
  const run = await getRun(runId);
  if (!run || (project && run.project !== project)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const preview = await briefPreview(runId);
  if (!preview) return NextResponse.json({ error: "run not found" }, { status: 404 });

  const redacted = url.searchParams.get("redact") === "1";
  const text = redacted ? preview.redacted : preview.full;

  return NextResponse.json({
    providers,
    citationRule: CITATION_RULE,
    brief: { text, chars: text.length, verdicts: preview.verdicts, redacted },
  });
}

export async function POST(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  let body: Partial<AnalyzeInput>;
  try {
    body = (await req.json()) as Partial<AnalyzeInput>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const project = projectScope(req);
  const run = await getRun(body.runId ?? "");
  if (!run || (project && run.project !== project)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const outcome = await runAnalysis({
    runId: body.runId ?? "",
    provider: body.provider ?? "",
    model: body.model,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    redactArgs: body.redactArgs,
  });

  if (!outcome.ok) {
    const { error, raw } = outcome;
    return NextResponse.json({ error, raw }, { status: outcome.status });
  }
  return NextResponse.json(outcome);
}
