import type { ProviderId } from "@/lib/analysis/catalog";

/** 사용자에게 보여줄 수 있는 실패. 메시지에 키가 들어가지 않게 호출부가 만든다. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface CallOpts {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export interface CallResult {
  text: string;
  usage: { input: number; output: number } | null;
  model: string;
  /** 제공자가 스키마를 강제했는가. 안 했으면 파싱 실패가 정상 범위 안이다. */
  schemaEnforced: boolean;
}
