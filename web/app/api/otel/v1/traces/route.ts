import { receiveOtlp } from "@/lib/otlp-receiver";

/** 표준 OTLP/HTTP 경로. `OTEL_EXPORTER_OTLP_ENDPOINT=<host>/api/otel` 이면 여기로 온다. */
export const POST = receiveOtlp;
