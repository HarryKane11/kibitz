import type { Run, Turn } from "@/lib/types";

/**
 * 스킬 후보 채굴.
 *
 * 같은 일을 **여러 세션에 걸쳐** 반복하고 있다면 그건 스킬(또는 스크립트)이 되어야
 * 한다. 한 세션 안의 반복은 이미 `repeated-call` 로 잡는다. 여기서 보는 것은
 * 그것보다 한 층 위다 — 어제도 오늘도 같은 것을 손으로 다시 하고 있는가.
 *
 * **LLM 을 쓰지 않는다.** 시그니처 정규화 + 개수 세기뿐이므로 제안마다 근거가
 * 그대로 붙는다: 몇 개 세션에서 몇 번 나왔고 토큰을 얼마나 썼는지.
 * 모델에게 "뭘 스킬로 만들까?"를 물으면 그 답을 검증할 방법이 없다.
 */

export interface SkillCandidate {
  id: string;
  /** 정규화된 시그니처 — 무엇이 반복되는가 */
  signature: string;
  kind: "command" | "file";
  occurrences: number;
  /** 몇 개 세션에 걸쳐 있나. 이게 1이면 스킬이 아니라 그 세션의 반복이다. */
  runIds: string[];
  sources: string[];
  tokens: number;
  ms: number;
  /** 실제 호출 문자열 — 제안이 무엇에서 나왔는지 보여준다 */
  examples: string[];
}

const SHELL = new Set(["Bash", "exec_command", "shell", "run_command", "write_stdin"]);
const FILE = new Set(["Read", "read_file", "Edit", "Write", "apply_patch", "edit_file"]);

/**
 * 호출 문자열에서 도구와 첫 인자를 되돌린다. 인제스터가 `tool(key="value")` 로 쓴다.
 *
 * `truncated` 가 중요하다. 인제스터는 56자에서 자르므로 긴 경로는 끝이 날아간다.
 * 그런 값에서 basename 을 뽑으면 `-Users-me-a` 같은 조각이 파일 이름인 척
 * 하게 된다 — 잘린 값으로는 파일 시그니처를 만들지 않는다.
 */
function parseCall(call: string): { tool: string; value: string; truncated: boolean } {
  const open = call.indexOf("(");
  if (open < 0) return { tool: call, value: "", truncated: false };
  const tool = call.slice(0, open);
  const inner = call.slice(open + 1, call.lastIndexOf(")"));
  const eq = inner.indexOf('="');
  if (eq < 0) return { tool, value: "", truncated: false };
  const raw = inner.slice(eq + 2).replace(/"$/, "");
  const truncated = raw.endsWith("…");
  return { tool, value: raw.replace(/…$/, ""), truncated };
}

/**
 * 스킬 후보가 될 수 없는 명령.
 *
 * 길 찾기와 훑어보기다 — 반복되는 게 당연하고, 스크립트로 묶어도 아무것도 아껴지지
 * 않는다. 이걸 남겨 두면 진짜 후보(테스트·린트·빌드 파이프라인)가 목록 아래로 밀린다.
 */
const NAVIGATION = new Set([
  "pwd", "ls", "cd", "echo", "cat", "sed", "head", "tail", "wc", "which",
  "true", "false", "sleep", "printf", "awk", "cut", "sort", "uniq", "find",
  // 셸 제어 구문. `for f in …` 은 명령이 아니라 문법이므로 시그니처가 되면
  // 서로 전혀 다른 일들이 한 덩어리로 묶인다.
  "for", "while", "if", "do", "then", "case", "until", "function",
]);

/**
 * 명령을 정규화한다.
 *
 * 경로·숫자·따옴표 안의 내용은 호출마다 다르지만 **하는 일은 같다.** 그것들을
 * 지우고 남는 앞부분이 시그니처다. 너무 많이 지우면 서로 다른 일이 한 덩어리가
 * 되므로 앞 3토큰까지만 본다.
 */
function commandSignature(raw: string): string | null {
  // 파이프·연쇄로 이어진 첫 명령만 본다 — 그게 이 호출의 의도다
  const head = raw.split(/[;|&]{1,2}/)[0].trim();
  const words = head
    .split(/\s+/)
    .filter((w) => !w.startsWith("-")) // 플래그는 호출마다 다르다
    .map((w) => w.replace(/^["']|["']$/g, ""));
  if (!words.length) return null;

  // 절대경로로 시작하면 그건 명령이 아니라 파일이다
  if (words[0].startsWith("/") || words[0].startsWith("~")) return null;

  const head0 = words[0].includes("/") ? words[0].split("/").pop()! : words[0];
  if (NAVIGATION.has(head0)) return null;

  const sig = words
    .slice(0, 3)
    .map((w) => (w.includes("/") ? w.split("/").pop()! : w))
    .filter(Boolean)
    .join(" ");
  return sig.length >= 2 ? sig : null;
}

/** 파일 경로는 basename 으로 묶는다 — 같은 파일을 매 세션 다시 읽고 있는가. */
function fileSignature(raw: string): string | null {
  const base = raw.split("/").pop()?.trim();
  if (!base || base.length < 3) return null;
  return base;
}

interface Bucket {
  signature: string;
  kind: "command" | "file";
  occurrences: number;
  runIds: Set<string>;
  sources: Set<string>;
  tokens: number;
  ms: number;
  examples: Set<string>;
}

/**
 * 세션 간 반복을 스킬 후보로.
 *
 * `minRuns` 가 핵심 문턱이다. 한 세션에서만 반복된 것은 그 세션의 문제이고
 * (이미 `repeated-call` 로 잡힌다) 스킬로 만들 근거가 아니다.
 */
export function buildSkillCandidates(
  runs: Run[],
  { minRuns = 2, minOccurrences = 4, limit = 24 } = {},
): SkillCandidate[] {
  const buckets = new Map<string, Bucket>();

  const add = (
    key: string,
    signature: string,
    kind: "command" | "file",
    run: Run,
    turn: Turn,
  ) => {
    const b =
      buckets.get(key) ??
      {
        signature,
        kind,
        occurrences: 0,
        runIds: new Set<string>(),
        sources: new Set<string>(),
        tokens: 0,
        ms: 0,
        examples: new Set<string>(),
      };
    b.occurrences += 1;
    b.runIds.add(run.id);
    if (run.source) b.sources.add(run.source);
    b.tokens += turn.tokens;
    b.ms += turn.durationMs;
    if (b.examples.size < 3 && turn.call) b.examples.add(turn.call);
    buckets.set(key, b);
  };

  for (const run of runs) {
    for (const turn of run.turns) {
      if (!turn.call) continue;
      const { tool, value, truncated } = parseCall(turn.call);
      if (!value) continue;

      if (SHELL.has(tool)) {
        // 명령은 앞부분이 온전하므로 잘렸어도 시그니처를 만들 수 있다.
        const sig = commandSignature(value);
        if (sig) add(`cmd:${sig}`, sig, "command", run, turn);
      } else if (FILE.has(tool) && !truncated) {
        const sig = fileSignature(value);
        if (sig) add(`file:${sig}`, sig, "file", run, turn);
      }
    }
  }

  return [...buckets.entries()]
    .map(([id, b]) => ({
      id,
      signature: b.signature,
      kind: b.kind,
      occurrences: b.occurrences,
      runIds: [...b.runIds],
      sources: [...b.sources].sort(),
      tokens: b.tokens,
      ms: b.ms,
      examples: [...b.examples],
    }))
    .filter((c) => c.runIds.length >= minRuns && c.occurrences >= minOccurrences)
    // 세션 수가 첫 기준이다 — 여러 세션에 걸친 반복이 스킬이 되어야 할 신호다.
    .sort(
      (a, b) =>
        b.runIds.length - a.runIds.length ||
        b.occurrences - a.occurrences ||
        b.tokens - a.tokens,
    )
    .slice(0, limit);
}
