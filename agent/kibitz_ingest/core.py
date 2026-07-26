"""
Kibitz 인제스트 코어 — 어댑터가 공유하는 것.

에이전트마다 기록 형식이 다르지만 **판정 규칙은 같아야 한다.** 규칙이 어댑터마다
갈라지면 "Claude Code 에서는 문제인데 Codex 에서는 아니다" 같은 일이 생기고,
그 순간 이 도구의 숫자를 비교할 수 없게 된다. 그래서 탐지는 여기 하나뿐이다.

LLM을 호출하지 않는다. 모든 판정은 아래 셋에서만 나온다.
  1. 툴 호출의 이름/인자  (해시 비교, 시퀀스 분석)
  2. 토큰 usage           (실측 — 추정하지 않는다)
  3. 타임스탬프·소요시간  (실측)
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# ── 툴 분류 ────────────────────────────────────────────────────────
# 국면(phase)은 툴 종류에서 결정론적으로 정한다. 모델에게 묻지 않는다.
# Claude Code 와 Codex 의 도구 이름을 함께 담는다. 이름이 다르다고 규칙이 갈라지면
# 두 에이전트의 숫자를 비교할 수 없게 된다.
READ_TOOLS = {
    # Claude Code
    "Read", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookRead",
    # Codex
    "read_file", "list_dir", "grep", "web_search", "tool_search",
}
WRITE_TOOLS = {
    "Edit", "Write", "NotebookEdit", "MultiEdit",
    "apply_patch", "write_file", "edit_file",
}
EXEC_TOOLS = {"Bash", "BashOutput", "KillShell", "exec_command", "shell", "run_command"}
DELEGATE_TOOLS = {"Agent", "Task", "spawn_agent"}

# 관측 종류(LangSmith run type). 트리에서 아이콘과 색을 결정한다.
# 도구 이름에서 결정론적으로 나온다 — 모델에게 묻지 않는다.
# 시스템이 user 라인에 끼워 넣는 것들. 사용자의 *요청*이 아니다.
#   [Request interrupted...]  실제 사람의 개입이지만 새 요청은 아니다 → event
#   [Image: ...]              첨부파일 메타데이터 → attachment
# 이걸 요청으로 세면 "사람 개입 N회"가 부풀고(이 코퍼스에서 11.6%),
# 요청 단위 묶음도 잘게 쪼개져 계층이 무의미해진다.
# 한 관측에 붙일 수 있는 지연의 상한.
#
# 우리가 가진 것은 이벤트 타임스탬프뿐이므로 "간격"은 에이전트가 일한 시간과
# 사람이 자리를 비운 시간을 함께 담는다. 실측 코퍼스에서 한 세션은 66시간짜리
# 간격을 갖고 있었다 — 사흘 열려 있었던 것이고, 그 런 지연의 99.8%가 사람의 부재였다.
# 그걸 지연이라 부르면 p95 가 무의미해진다.
#
# 요청 직후 첫 스텝의 간격은 사람이 타이핑한 시간을 포함하므로 통째로 idle 이고,
# 나머지는 상한을 넘는 부분만 idle 로 넘긴다. 버리지 않고 따로 센다 —
# 사라진 시간은 나중에 아무도 설명할 수 없다.
STEP_LATENCY_CAP_MS = 300_000

ATTACHMENT_RE = re.compile(r"^\[Image\b")
INTERRUPT_RE = re.compile(r"^\[Request interrupted")


def obs_type(tool: str | None) -> str:
    if tool is None:
        return "llm"
    if tool == "tool_search":
        # 어떤 도구가 있는지 찾는 행위. 조회이지만 정보가 아니라 능력을 찾는다.
        return "retriever"
    if tool in DELEGATE_TOOLS:
        return "agent"
    if tool in READ_TOOLS:
        return "retriever"
    return "tool"

# 결과가 "빈손"인지 판정하는 문자열 신호 — 전부 문자열 검사다
EMPTY_MARKERS = (
    "No files found",
    "No matches found",
    "no matches",
    "0 results",
    "not found",
    "does not exist",
    "No such file",
)


def sha(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:8]


def canonical(obj: Any) -> str:
    """인자를 정렬된 JSON으로 정규화. 키 순서 차이로 해시가 갈리면 안 된다."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def spoken_text(content: Any) -> str:
    """사람이 실제로 입력한 텍스트만.

    Claude Code 는 **툴 결과도 user 라인에 실어 보낸다.** flatten() 은 중첩
    content 까지 펼치므로 툴 출력이 사용자 발화로 새어 들어온다 — 그러면 요청
    27건이 65건으로 보이고, 요청 단위 묶음이 무의미해진다.
    tool_result 가 섞인 라인은 요청이 아니다.
    """
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
        return ""
    return "\n".join(
        b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
    )


def flatten(content: Any) -> str:
    """content(문자열 | 블록 배열)를 평문으로."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out: list[str] = []
    for b in content:
        if isinstance(b, str):
            out.append(b)
        elif isinstance(b, dict):
            if b.get("type") == "text":
                out.append(b.get("text", ""))
            elif b.get("type") == "thinking":
                pass  # 사고는 서사에 넣지 않는다
            elif "content" in b:
                out.append(flatten(b["content"]))
    return "\n".join(out)


# ── 결정론 탐지 규칙 ───────────────────────────────────────────────


def detect(turns: list[dict], answer_text: str, sources: list[str]) -> None:
    """여섯 규칙을 트레이스에 적용한다. 전부 문자열·해시·집합 연산뿐이다."""

    seen: dict[str, int] = {}  # 인자 해시 → 최초 등장 턴
    names: list[tuple[int, str]] = []

    # 쓰기가 일어난 지점을 미리 색인해 둔다.
    #
    # 파일을 고친 뒤 다시 읽는 것은 정당한 재호출이다. 해시만 보면 구분되지
    # 않으므로, 두 호출 사이에 그 대상에 대한 쓰기가 있었는지 함께 본다.
    # 이것도 전부 기록에 있는 값이라 여전히 결정론이다.
    writes: list[tuple[int, str]] = [
        (t["index"], t.get("_target", "")) for t in turns if t.get("_tool") in WRITE_TOOLS
    ]
    any_write_between = lambda a, b: any(a < i < b for i, _ in writes)
    write_to_between = lambda a, b, tgt: any(
        a < i < b and tgt and (tgt == w or tgt in w or w in tgt) for i, w in writes
    )

    for t in turns:
        h = t.get("callHash")
        if not h:
            continue
        idx = t["index"]
        names.append((idx, t["_tool"]))

        # ── 1. 동일 호출 반복 ──────────────────────────────────
        if h in seen:
            prev = seen[h]
            tgt = t.get("_target", "")
            # 사이에 쓰기가 있었으면 재확인이지 반복이 아니다
            legit = (
                write_to_between(prev, idx, tgt)
                if tgt
                else any_write_between(prev, idx)
            )
            if legit:
                seen[h] = idx
                continue
            t["verdict"] = "error"
            t["note"] = {
                "kind": "repeated-call",
                "evidence": [
                    {"label": "tool", "value": t["_tool"]},
                    {"label": "argHash", "value": h, "compare": h, "compareTurn": prev, "relation": "same"},
                    {"label": "writesBetween", "value": "", "valueKey": "none"},
                    {"label": "newRecords", "value": "0"},
                ],
                "counterfactual": {
                    "savedTurns": 1,
                    "savedMs": t["durationMs"],
                    "savedTokens": t["tokens"],
                },
            }
        else:
            seen[h] = idx

    # ── 2. 호출 사이클 (길이 2 이상 반복 부분열) ───────────────
    seq = [n for _, n in names]
    for size in (2, 3):
        for i in range(len(seq) - size * 2 + 1):
            a, b = seq[i : i + size], seq[i + size : i + size * 2]
            if a == b and len(set(a)) > 1:
                idx = names[i + size][0]
                tgt = next((t for t in turns if t["index"] == idx), None)
                if tgt and not tgt.get("note"):
                    tgt["verdict"] = "waste"
                    tgt["note"] = {
                        "kind": "call-cycle",
                        "evidence": [
                            {"label": "repeatedSubsequence", "value": " → ".join(a)},
                            {"label": "startTurn", "value": str(names[i][0])},
                        ],
                        "counterfactual": {
                            "savedTurns": size,
                            "savedMs": tgt["durationMs"],
                            "savedTokens": tgt["tokens"],
                        },
                    }
                break

    # ── 3. 빈 결과 후 미전환 ───────────────────────────────────
    for i, t in enumerate(turns[:-1]):
        if not t.get("_empty") or t.get("note"):
            continue
        nxt = next((u for u in turns[i + 1 :] if u.get("callHash")), None)
        if nxt and nxt["_tool"] == t["_tool"] and nxt["callHash"] != t["callHash"]:
            continue  # 인자를 바꿨다 — 정상적인 전환
        if nxt and nxt["_tool"] == t["_tool"]:
            t["verdict"] = "waste"
            t["note"] = {
                "kind": "empty-result-loop",
                "evidence": [
                    {"label": "result", "value": "", "valueKey": "empty"},
                    {"label": "nextCall", "value": nxt["_tool"], "compare": t["_tool"], "relation": "same"},
                ],
                "counterfactual": {
                    "savedTurns": 1,
                    "savedMs": t["durationMs"],
                    "savedTokens": t["tokens"],
                },
            }

    # ── 4. 컨텍스트 메시지 소실 ────────────────────────────────
    for i in range(1, len(turns)):
        prev, cur = turns[i - 1], turns[i]
        before = set(prev.get("messageIds") or [])
        after = set(cur.get("messageIds") or [])
        missing = sorted(before - after)
        if before and after and missing and not cur.get("note"):
            cur["verdict"] = "error"
            cur["note"] = {
                "kind": "context-eviction",
                "evidence": [
                    {
                        "label": "missingMessage",
                        "value": ", ".join(missing[:6]),
                        "relation": "missing",
                    },
                    {
                        "label": "messageCount",
                        "value": f"{len(before)} → {len(after)}",
                    },
                ],
                "counterfactual": {
                    "savedTurns": 0,
                    "savedMs": 0,
                    "savedTokens": 0,
                },
            }
            break

    # ── 5. 프리픽스 캐시 소실 ──────────────────────────────────
    # Claude Code는 대화 프리픽스를 캐시한다. cache_read가 크게 떨어지면
    # 프리픽스가 깨진 것이고, 그만큼을 다시 입력 토큰으로 지불한다.
    for i in range(1, len(turns)):
        prev, cur = turns[i - 1], turns[i]
        pr, cr = prev.get("_cacheRead", 0), cur.get("_cacheRead", 0)
        if pr > 20000 and cr < pr * 0.5 and cur.get("_cacheWrite", 0) > 10000 and not cur.get("note"):
            cur["verdict"] = "error"
            cur["note"] = {
                "kind": "cache-break",
                "evidence": [
                    {"label": "cacheRead", "value": f"{pr:,} → {cr:,}", "relation": "missing"},
                    {"label": "cacheWrite", "value": f"{cur['_cacheWrite']:,}"},
                    {"label": "repaidTokens", "value": f"{max(0, pr - cr):,}"},
                ],
                "counterfactual": {
                    "savedTurns": 0,
                    "savedMs": 0,
                    "savedTokens": max(0, pr - cr),
                },
            }
            break

    # ── 6. 출처 없는 숫자 ──────────────────────────────────────
    # 최종 답변의 숫자 리터럴을 모든 도구 출력·사용자 입력과 문자열 대조.
    # 판정에 모델을 쓰지 않으므로 좁고, 계산 근거를 그대로 노출할 수 있다.
    if answer_text:
        haystack = "\n".join(sources)
        claims: list[dict] = []
        for m in re.finditer(r"\b\d[\d,]*\.?\d*\s*%?", answer_text):
            raw = m.group().strip()
            norm = raw.replace(",", "").rstrip("%").rstrip(".")
            if not norm or len(norm) < 2 or norm in {"1", "2", "3"}:
                continue  # 목록 번호 같은 잡음은 제외
            found = norm in haystack.replace(",", "") or raw in haystack
            claims.append({"text": raw, "sourceTurn": None if not found else 0})
        unsourced = [c["text"] for c in claims if c["sourceTurn"] is None]
        if unsourced:
            answer_turn = next(
                (turn for turn in reversed(turns) if turn.get("kind") == "answer"),
                turns[-1],
            )
            answer_turn["_claims"] = claims
            if not answer_turn.get("note"):
                answer_turn["verdict"] = "error"
                answer_turn["note"] = {
                    "kind": "unsourced-number",
                    "evidence": [
                        {"label": "comparedNumbers", "value": str(len(claims))},
                        {
                            "label": "unsourced",
                            "value": ", ".join(unsourced[:6]),
                            "relation": "absent",
                        },
                    ],
                    "counterfactual": {
                        "savedTurns": 0,
                        "savedMs": 0,
                        "savedTokens": 0,
                    },
                }



def title_of(text: str, key: str, tool: str | None = None) -> dict:
    """모델이 스스로 쓴 문장이 있으면 그것이 제목이다. 없을 때만 우리가 이름을 붙인다."""
    text = (text or "").strip()
    if text:
        return {"title": text}
    out = {"title": "", "titleKey": key}
    if tool:
        out["titleTool"] = tool
    return out


# ── 변환 ───────────────────────────────────────────────────────────


def project_name(path: Path) -> str:
    """세션 파일 경로에서 사람이 읽는 프로젝트 이름을 뽑는다.

    Claude Code는 cwd를 `-`로 이어 디렉터리 이름을 만든다.
    (`-Users-yunseongjae-Desktop-braincrew` → `braincrew`)
    홈 경로 접두사를 걷어내고 남은 첫 의미 있는 조각을 쓴다.
    """
    raw = path.parent.name
    parts = [x for x in raw.split("-") if x]
    for skip in ("Users", "Desktop"):
        while parts and parts[0] == skip:
            parts.pop(0)
    if parts and parts[0] == Path.home().name:
        parts.pop(0)
    # 워크트리 경로는 `--claude-worktrees-` 뒤가 잡음이므로 앞부분만 쓴다
    out: list[str] = []
    for x in parts:
        if x in ("claude", "worktrees"):
            break
        out.append(x)
    return "-".join(out[:3]) or "session"


def ctx(read: int, write: int, fresh: int, out: int) -> list[dict]:
    """컨텍스트 구성 — 캐시 계층 실측. 역할별 분해는 기록에 없으므로 하지 않는다."""
    return [
        {"label": "cacheRead", "tokens": read},
        {"label": "cacheWrite", "tokens": write},
        {"label": "freshInput", "tokens": fresh},
        {"label": "output", "tokens": out},
    ]


def cost(tokens: int) -> float:
    return round(tokens * 5.0 / 1_000_000, 6)  # Opus 입력가 기준 근사


# 인자에서 "이 호출이 무엇인지" 를 말해 주는 키. 에이전트마다 이름이 다르다.
#   Claude Code: file_path · pattern · command · query · description · url
#   Codex:       cmd · input · workdir · path
IDENTIFYING_ARGS = (
    "command",
    "cmd",
    "file_path",
    "path",
    "pattern",
    "query",
    "url",
    "description",
    "input",
)


def short_args(args: dict) -> str:
    """호출을 한 줄로. **앞에서** 자른다.

    전에는 뒤에서 52자를 잘라 `command=" -5; git log …"` 처럼 명령의 시작이 사라졌다.
    명령을 식별하는 것은 앞부분(`git log --oneline`)이고 뒤는 그 인자다.
    """
    def render(key: str, raw: object) -> str:
        v = " ".join(str(raw).split())  # 개행·중복 공백을 접는다
        return f'{key}="{v[:56]}…"' if len(v) > 56 else f'{key}="{v}"'

    for k in IDENTIFYING_ARGS:
        if k in args and args[k] not in (None, ""):
            return render(k, args[k])

    # 알려진 키가 없으면 **첫 인자**를 쓴다. SDK 로 계측한 함수의 파라미터 이름은
    # 우리가 알 수 없고(`record_id`, `ticket`, …), `…` 로 두면 화면에서 그 호출이
    # 무엇이었는지 알 수 없다. 이름과 값이 함께 있으면 그것으로 충분하다.
    for k, raw in args.items():
        if raw not in (None, "") and not isinstance(raw, (dict, list)):
            return render(k, raw)
    return "…"


def first_line(text: str) -> str:
    for line in text.strip().split("\n"):
        s = line.strip().lstrip("#").strip()
        if len(s) > 8:
            return s[:110]
    return ""


def split_title(turns: list[dict]) -> tuple[str, str]:
    # 사용자 발화 중 사람이 쓴 문장처럼 보이는 첫 줄을 고른다.
    # 붙여넣은 로그·JSON 조각이 제목이 되면 목록이 읽히지 않는다.
    raw = "세션"
    for t in turns:
        if t["kind"] != "user":
            continue
        cand = (t.get("utterance") or "").strip()
        if len(cand) < 6 or cand[0] in "{[<|\"" or cand.count('"') > 2:
            continue
        raw = cand
        break
    raw = re.sub(r"\s+", " ", raw).strip()[:80]
    if len(raw) > 40:
        return raw[:40], raw[40:]
    return raw, ""
