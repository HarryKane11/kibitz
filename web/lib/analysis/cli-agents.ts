import "server-only";

import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProviderId } from "@/lib/analysis/catalog";
import { isPublicSite } from "@/lib/deploy";
import {
  ProviderError,
  type CallOpts,
  type CallResult,
} from "@/lib/analysis/provider-contract";

export type CliAgentProvider = Extract<ProviderId, "claude-code" | "codex-cli">;

const STATUS_TIMEOUT_MS = 5_000;
const ANALYSIS_TIMEOUT_MS = 180_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 1_000_000;

export function localCodeAgentsEnabled(): boolean {
  // 공개 배포에서는 플래그와 무관하게 끈다. 여기서 켜면 방문자 아무나 배포자의
  // Claude·Codex 계정 예산을 쓸 수 있고, 그건 되돌릴 수 없는 실수다.
  if (isPublicSite()) return false;
  const configured = process.env.KIBITZ_ALLOW_LOCAL_CODE_AGENTS;
  return configured === "1" || (configured !== "0" && process.env.NODE_ENV !== "production");
}

function binFor(provider: CliAgentProvider): string {
  return provider === "claude-code"
    ? process.env.KIBITZ_CLAUDE_BIN || "claude"
    : process.env.KIBITZ_CODEX_BIN || "codex";
}

export function loginCommand(provider: CliAgentProvider): string {
  return provider === "claude-code"
    ? "claude auth login --claudeai"
    : "codex login --device-auth";
}

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
  timedOut: boolean;
};

function clean(text: string): string {
  return text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[^\S\r\n]+$/gm, "")
    .trim();
}

async function command(
  executable: string,
  args: string[],
  input: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let missing = false;
    let settled = false;

    const append = (current: string, chunk: Buffer): string =>
      (current + chunk.toString("utf8")).slice(-MAX_OUTPUT_BYTES);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      missing = error.code === "ENOENT";
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: null, stdout, stderr: error.message, missing, timedOut: false });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr, missing, timedOut: false });
      }
    });
    child.stdin.end(input);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ code: null, stdout, stderr, missing, timedOut: true });
    }, timeoutMs);
  });
}

export async function cliAgentStatus(provider: CliAgentProvider): Promise<{
  installed: boolean;
  loggedIn: boolean;
}> {
  if (!localCodeAgentsEnabled()) return { installed: false, loggedIn: false };
  const result =
    provider === "claude-code"
      ? await command(binFor(provider), ["auth", "status", "--json"], "", STATUS_TIMEOUT_MS)
      : await command(binFor(provider), ["login", "status"], "", STATUS_TIMEOUT_MS);
  if (result.missing) return { installed: false, loggedIn: false };
  if (provider === "codex-cli") {
    return {
      installed: true,
      loggedIn:
        result.code === 0 && /logged in/i.test(`${result.stdout}\n${result.stderr}`),
    };
  }
  try {
    const status = JSON.parse(result.stdout) as { loggedIn?: boolean };
    return { installed: true, loggedIn: result.code === 0 && status.loggedIn === true };
  } catch {
    return { installed: true, loggedIn: false };
  }
}

export async function callCliAgent(o: CallOpts): Promise<CallResult> {
  if (o.provider !== "claude-code" && o.provider !== "codex-cli") {
    throw new ProviderError("not a code-agent provider", 400);
  }
  if (!localCodeAgentsEnabled()) {
    throw new ProviderError(
      "local code-agent analysis is disabled — set KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1",
      403,
    );
  }

  const provider = o.provider;
  const status = await cliAgentStatus(provider);
  if (!status.installed) throw new ProviderError(`${provider}: CLI is not installed`, 400);
  if (!status.loggedIn) {
    throw new ProviderError(`${provider}: login required — run \`${loginCommand(provider)}\``, 401);
  }

  const work = mkdtempSync(join(tmpdir(), "kibitz-analysis-"));
  const schemaPath = join(work, "output.schema.json");
  const outputPath = join(work, "last-message.json");
  writeFileSync(schemaPath, JSON.stringify(o.schema), "utf8");
  const prompt = [
    "# System instructions",
    o.system,
    "",
    "# Trace brief",
    o.user,
  ].join("\n");

  try {
    if (provider === "codex-cli") {
      const args = [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-C",
        work,
      ];
      if (o.model) args.push("--model", o.model);
      args.push("-");
      const result = await command(binFor(provider), args, prompt, ANALYSIS_TIMEOUT_MS);
      assertSuccess(provider, result);
      const text = readFileSync(outputPath, "utf8").trim();
      if (!text) throw new ProviderError("codex-cli: final response was empty");
      return {
        text,
        usage: null,
        model: o.model || "Codex account default",
        schemaEnforced: true,
      };
    }

    const args = [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(o.schema),
      "--permission-mode",
      "dontAsk",
      "--tools",
      "",
      "--no-session-persistence",
      "--safe-mode",
      "--no-chrome",
    ];
    if (o.model) args.push("--model", o.model);
    const result = await command(binFor(provider), args, prompt, ANALYSIS_TIMEOUT_MS);
    assertSuccess(provider, result);
    let envelope: {
      result?: unknown;
      structured_output?: unknown;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw new ProviderError("claude-code: response envelope was not JSON");
    }
    const structured = envelope.structured_output ?? envelope.result;
    const text =
      typeof structured === "string" ? structured : JSON.stringify(structured ?? "");
    if (!text) throw new ProviderError("claude-code: final response was empty");
    return {
      text,
      usage: envelope.usage
        ? {
            input: envelope.usage.input_tokens ?? 0,
            output: envelope.usage.output_tokens ?? 0,
          }
        : null,
      model: envelope.model || o.model || "Claude Code account default",
      schemaEnforced: true,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function assertSuccess(provider: CliAgentProvider, result: CommandResult): void {
  if (result.timedOut) {
    throw new ProviderError(`${provider}: timed out after ${ANALYSIS_TIMEOUT_MS / 1000}s`);
  }
  if (result.missing) throw new ProviderError(`${provider}: CLI is not installed`, 400);
  if (result.code !== 0) {
    const detail = clean(result.stderr || result.stdout).slice(-500);
    throw new ProviderError(
      `${provider}: exited with ${result.code}${detail ? ` — ${detail}` : ""}`,
      /login|auth/i.test(detail) ? 401 : 502,
    );
  }
}

type LoginSession = {
  id: string;
  provider: CliAgentProvider;
  output: string;
  done: boolean;
  success: boolean;
  startedAt: number;
};

const globalLoginStore = globalThis as typeof globalThis & {
  __kibitzCliLogins?: Map<string, LoginSession>;
};
const loginSessions =
  globalLoginStore.__kibitzCliLogins ??
  (globalLoginStore.__kibitzCliLogins = new Map<string, LoginSession>());

export async function startCliLogin(provider: CliAgentProvider): Promise<{
  ok: boolean;
  sessionId?: string;
  command: string;
  error?: string;
}> {
  const displayCommand = loginCommand(provider);
  if (!localCodeAgentsEnabled()) {
    return {
      ok: false,
      command: displayCommand,
      error: "Set KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1 on the Kibitz server first.",
    };
  }
  const status = await cliAgentStatus(provider);
  if (!status.installed) {
    return { ok: false, command: displayCommand, error: `${provider}: CLI is not installed.` };
  }
  if (status.loggedIn) return { ok: true, command: displayCommand };

  const active = [...loginSessions.values()].find(
    (session) => session.provider === provider && !session.done,
  );
  if (active) return { ok: true, sessionId: active.id, command: displayCommand };

  const session: LoginSession = {
    id: randomUUID(),
    provider,
    output: "",
    done: false,
    success: false,
    startedAt: Date.now(),
  };
  loginSessions.set(session.id, session);
  const args =
    provider === "claude-code"
      ? ["auth", "login", "--claudeai"]
      : ["login", "--device-auth"];
  const child = spawn(binFor(provider), args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (chunk: Buffer) => {
    session.output = clean((session.output + chunk.toString("utf8")).slice(-8_000));
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    session.output = clean(`${session.output}\n${error.message}`);
    session.done = true;
  });
  child.on("close", (code) => {
    session.done = true;
    session.success = code === 0;
  });
  setTimeout(() => {
    if (!session.done) {
      child.kill("SIGTERM");
      session.output = clean(`${session.output}\nLogin timed out after 10 minutes.`);
      session.done = true;
    }
  }, LOGIN_TIMEOUT_MS);
  return { ok: true, sessionId: session.id, command: displayCommand };
}

export async function pollCliLogin(sessionId: string): Promise<{
  found: boolean;
  output: string;
  done: boolean;
  success: boolean;
}> {
  const session = loginSessions.get(sessionId);
  if (!session) return { found: false, output: "", done: true, success: false };
  if (session.done && Date.now() - session.startedAt > 60_000) {
    loginSessions.delete(sessionId);
  }
  return {
    found: true,
    output: session.output,
    done: session.done,
    success: session.success,
  };
}
