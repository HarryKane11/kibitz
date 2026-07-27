import { receiveOtlp } from "@/lib/otlp-receiver";

/**
 * Langfuse 와 같은 경로.
 *
 * 이미 Langfuse 로 계측한 코드가 host 만 바꿔서 들어올 수 있게 한다 — 경로와
 * Basic 인증 형식을 그대로 받는다. 그게 "대체할 수 있다"의 실제 의미다.
 */
export const POST = receiveOtlp;
