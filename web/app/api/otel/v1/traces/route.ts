import { NextResponse } from "next/server";
import { otlpToRuns, type OtlpExportRequest } from "@/lib/otlp";
import { storeRun } from "@/lib/store";
import { authorizeIngest, projectScope } from "@/lib/api";

const MAX_BYTES = 16 * 1024 * 1024;

/** OTLP/HTTP JSON receiver. Configure an exporter with endpoint `/api/otel`. */
export async function POST(req: Request) {
  const denied = authorizeIngest(req);
  if (denied) return denied;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return NextResponse.json(
      {
        error: "unsupported encoding",
        detail: "Use OTLP/HTTP JSON (application/json). Protobuf and gRPC are not accepted here.",
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
  const runs = otlpToRuns(body, project);
  for (const run of runs) storeRun(run);
  return NextResponse.json({ partialSuccess: {}, acceptedTraces: runs.length });
}
