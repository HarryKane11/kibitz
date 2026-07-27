"use server";

import { runAnalysis, providerStatuses, savedAnalyses } from "@/lib/analysis/run";
import { deleteAnalysis } from "@/lib/analysis/store";
import {
  pollCliLogin,
  startCliLogin,
  type CliAgentProvider,
} from "@/lib/analysis/cli-agents";
import type {
  AnalyzeInput,
  AnalyzeOutcome,
  CliLoginPoll,
  CliLoginStart,
  ProviderStatus,
} from "@/lib/analysis/catalog";

/**
 * 화면이 부르는 입구.
 *
 * 라우트가 아니라 서버 액션인 이유: `KIBITZ_READ_TOKEN` 을 걸어 둔 설치에서도
 * 화면이 동작해야 한다. 브라우저는 그 토큰을 갖고 있지 않고, 갖게 만들면 토큰이
 * 클라이언트 번들에 들어간다. 서버 액션은 같은 출처 POST 라 그 문제가 없다.
 *
 * 키는 이 함수의 인자로 한 번 건너가고 그 요청 안에서만 쓰인다 — 저장하지 않는다.
 */
export async function analyzeTrace(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  return runAnalysis(input);
}

/** ollama 를 실제로 물어본다. 사용자가 ollama 를 고를 때만 부른다. */
export async function refreshProviders(): Promise<ProviderStatus[]> {
  return providerStatuses(true);
}

export async function startCodeAgentLogin(provider: string): Promise<CliLoginStart> {
  if (provider !== "claude-code" && provider !== "codex-cli") {
    return { ok: false, command: "", error: "unknown code-agent provider" };
  }
  return startCliLogin(provider as CliAgentProvider);
}

export async function pollCodeAgentLogin(sessionId: string): Promise<CliLoginPoll> {
  return pollCliLogin(sessionId);
}

/** 저장된 분석을 지운다. 오래됐거나 틀린 제안을 남겨 둘 이유는 없다. */
export async function forgetAnalysis(runId: string, id: string) {
  return deleteAnalysis(runId, id);
}

/** 새로고침 뒤 목록을 다시 읽는다. */
export async function listAnalyses(runId: string) {
  return savedAnalyses(runId);
}
