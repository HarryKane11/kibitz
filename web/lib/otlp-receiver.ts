import "server-only";
import { NextResponse } from "next/server";
import { flattenOtlp, runFromSpans, type OtlpExportRequest } from "@/lib/otlp";
import { appendSpans } from "@/lib/spans";
import { storeRun } from "@/lib/store";
import { authorizeIngest, projectScope } from "@/lib/api";

/**
 * OTLP 수신 한 벌.
 *
 * 라우트가 여럿인 이유는 기능이 여럿이어서가 아니다 — 이미 Langfuse 나 Phoenix 로
 * 계측해 둔 코드가 **host 만 바꿔서** 들어올 수 있어야 하기 때문이다:
 *
 *   /api/otel/v1/traces          표준 OTLP 경로 (OTEL_EXPORTER_OTLP_ENDPOINT=/api/otel)
 *   /api/public/otel/v1/traces   Langfuse 와 같은 경로
 *   /api/public/otel             Langfuse 의 base 경로
 *
 * 핸들러는 하나다. 셋이 각자 구현을 들고 있으면 하나만 고쳐지고, 그때 어느 경로로
 * 보냈는지에 따라 결과가 달라진다.
 */

const MAX_BYTES = 16 * 1024 * 1024;

export async function receiveOtlp(req: Request): Promise<NextResponse> {
  const denied = authorizeIngest(req);
  if (denied) return denied;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return NextResponse.json(
      {
        error: "unsupported encoding",
        detail:
          "Use OTLP/HTTP JSON (application/json). Protobuf and gRPC are not accepted here — " +
          "set OTEL_EXPORTER_OTLP_PROTOCOL=http/json.",
      },
      { status: 415 },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let body: OtlpExportRequest;
  try {
    body = JSON.parse(raw) as OtlpExportRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const project = projectScope(req) ?? req.headers.get("x-kibitz-project") ?? undefined;

  let spans = 0;
  const traces: { id: string; spans: number; open: boolean }[] = [];

  for (const [traceId, batch] of flattenOtlp(body)) {
    spans += batch.length;
    // 덧붙인 뒤 **누적 전체**를 돌려받는다 — 이 한 줄이 실시간 수집의 전부다.
    // 배치만으로 Run 을 만들면 앞 배치가 지워진다 (lib/spans.ts 주석 참고).
    const all = appendSpans(traceId, batch);
    const run = runFromSpans(traceId, all, project);
    if (!run) continue;
    storeRun(run);
    traces.push({ id: run.id, spans: all.length, open: run.open === true });
  }

  // OTLP 규약은 성공 시 빈 `partialSuccess` 를 요구한다. 나머지는 우리 확장이다 —
  // 수집기를 처음 붙일 때 "들어왔나"를 curl 로 확인할 수 있어야 한다.
  return NextResponse.json({ partialSuccess: {}, acceptedSpans: spans, traces });
}
