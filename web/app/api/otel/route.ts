import { receiveOtlp } from "@/lib/otlp-receiver";

/** base 경로에 그대로 POST 하는 exporter 를 위해. 핸들러는 /v1/traces 와 같다. */
export const POST = receiveOtlp;
