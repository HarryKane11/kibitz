"""
Codex 어댑터.

세션 기록: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

Codex 는 Claude Code 보다 **좋은 신호를 준다.** 추론해야 했던 것이 여기서는 기록되어 있다:

| 신호 | Claude Code | Codex |
|---|---|---|
| 턴 소요시간 | 이벤트 간격에서 추론 (사람 부재가 섞인다) | `task_complete.duration_ms` 실측 |
| 컨텍스트 손실 | 캐시 읽기 급락으로 추정 | `context_compacted` 명시적 이벤트 |
| 캐시 토큰 | `cache_read_input_tokens` | `last_token_usage.cached_input_tokens` |
| 동적 툴 탐색 | 없음 | `tool_search_call` |

줄 종류:
  session_meta   런 메타 (id, cwd, model_provider, cli_version)
  turn_context   턴별 모델·추론강도·승인정책·샌드박스
  response_item  실제 메시지 — message / reasoning / function_call / custom_tool_call
  event_msg      task_complete(duration_ms) · token_count(usage) · context_compacted
  compacted      압축된 히스토리 (그 자체가 컨텍스트 손실의 증거)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterator

from kibitz_ingest.core import canonical, parse_ts, sha
from kibitz_ingest.event import Event

SOURCE = "codex"
DEFAULT_ROOT = Path.home() / ".codex" / "sessions"

# apply_patch 등은 function_call 이 아니라 custom_tool_call 로 온다.
CALL_TYPES = {"function_call", "custom_tool_call"}
OUTPUT_TYPES = {"function_call_output", "custom_tool_call_output"}

# 툴 출력에 `Wall time:` 이 적혀 오지만 (코퍼스 99%) 이건 **청크 단위** 값이다.
# 42/69 가 `0.0000` 이고, exec_command 는 `yield_time_ms` 로 쪼개져 돌기 때문에
# 명령 전체의 지연이 아니다. 그래서 호출별 지연으로 쓰지 않는다 —
# 신뢰할 수 없는 값을 턴 총계에서 빼면 정밀해 보이는 잡음이 된다.
#
# Codex 가 확실히 주는 것은 `task_complete.duration_ms`, 즉 **턴 총계**다.
# 우리가 아는 만큼만 말한다: 요청 단위 지연은 실측, 호출 단위는 미기록.
WALL_RE = re.compile(r"Wall time: ([\d.]+) seconds")

# Codex 가 user 역할에 끼워 넣는 것들. 사용자의 *요청*이 아니다.
#   <environment_context>            cwd·shell·날짜 주입
#   # AGENTS.md instructions for …   프로젝트 지시 주입
# 이걸 요청으로 세면 트레이스 제목이 지시문이 되고 요청 단위 묶음도 어긋난다.
INJECTED_PREFIXES = (
    "<environment_context>",
    "# AGENTS.md instructions for ",
    "# Files mentioned by the user",
)


def _is_injected(text: str) -> bool:
    t = text.lstrip()
    return t.startswith(INJECTED_PREFIXES) or t.startswith("<user_instructions>")


def _text(content: Any) -> str:
    """`content` 배열에서 사람이 읽는 텍스트만. 입력/출력 두 형태를 모두 받는다."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out: list[str] = []
    for b in content:
        if isinstance(b, dict) and b.get("type") in ("input_text", "output_text", "text"):
            out.append(b.get("text", ""))
    return "\n".join(out)


def _args(raw: Any) -> dict[str, Any]:
    """`arguments` 는 JSON 문자열로 오거나 이미 dict 로 온다. apply_patch 는 평문 patch 다."""
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"input": raw}
    except json.JSONDecodeError:
        # apply_patch 의 `*** Begin Patch` 처럼 JSON 이 아닌 입력.
        # 해시가 흔들리지 않게 원문 그대로 둔다.
        return {"input": raw}


def read_events(path: Path) -> Iterator[Event]:
    """rollout jsonl 을 스트리밍으로 읽는다."""
    outputs: dict[str, tuple[str, bool]] = {}
    call_ms: dict[str, int] = {}  # call_id → 실측 실행 시간
    pending: list[Event] = []
    model: str | None = None
    # duration 과 usage 는 호출보다 **나중에** 오므로 turn 단위로 모아 두고 마지막에 붙인다.
    turn_ms: dict[str, int] = {}
    last_usage: dict[str, Any] = {}
    turn_of: list[str] = []  # pending 과 같은 순서로 turn_id 를 기록
    current_turn = ""

    with path.open(encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue

            kind = o.get("type")
            payload = o.get("payload") or {}
            ts = parse_ts(o.get("timestamp"))

            if kind == "session_meta":
                model = payload.get("model") or model
                continue

            if kind == "turn_context":
                current_turn = payload.get("turn_id") or current_turn
                model = payload.get("model") or model
                continue

            if kind == "event_msg":
                et = payload.get("type")
                if et == "task_started":
                    current_turn = payload.get("turn_id") or current_turn
                    # 사용자 메시지는 task_started **앞에** 온다. 그대로 두면 그 요청이
                    # 직전 턴에 묶여 소요시간이 엉뚱한 곳에 붙는다. 방금 들어온
                    # 사용자 메시지를 이번 턴으로 다시 매긴다.
                    if pending and pending[-1].kind == "user" and turn_of:
                        turn_of[-1] = current_turn
                elif et == "task_complete":
                    tid = payload.get("turn_id") or current_turn
                    ms = payload.get("duration_ms")
                    if isinstance(ms, int):
                        turn_ms[tid] = ms
                elif et == "token_count":
                    info = payload.get("info") or {}
                    usage = info.get("last_token_usage") or {}
                    if usage:
                        last_usage[current_turn] = usage
                elif et == "context_compacted":
                    # 명시적 컨텍스트 손실. 추정이 아니라 에이전트가 그랬다고 말한 것이다.
                    pending.append(
                        Event(
                            "compacted",
                            ts,
                            o.get("id", ""),
                            text=str(payload.get("message") or ""),
                            model=model,
                            duration_ms=0,
                        )
                    )
                    turn_of.append(current_turn)
                continue

            if kind == "compacted":
                pending.append(
                    Event("compacted", ts, o.get("id", ""), model=model, duration_ms=0)
                )
                turn_of.append(current_turn)
                continue

            if kind != "response_item":
                continue

            pt = payload.get("type")

            if pt in OUTPUT_TYPES:
                cid = payload.get("call_id")
                if cid:
                    raw = payload.get("output")
                    text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
                    # custom_tool_call_output 은 JSON 안에 exit_code 를 담는다.
                    err = False
                    try:
                        meta = (json.loads(text) or {}).get("metadata") or {}
                        err = bool(meta.get("exit_code"))
                    except (json.JSONDecodeError, AttributeError, TypeError):
                        err = "Process exited with code " in text and (
                            "code 0" not in text
                        )
                    wall = WALL_RE.search(text)
                    ms = int(float(wall.group(1)) * 1000) if wall else None
                    outputs[cid] = (text, err)
                    if ms is not None:
                        call_ms[cid] = ms
                continue

            if pt in CALL_TYPES:
                name = payload.get("name") or "?"
                raw = payload.get("arguments") if pt == "function_call" else payload.get("input")
                pending.append(
                    Event(
                        "tool",
                        ts,
                        payload.get("call_id", ""),
                        tool=name,
                        args=_args(raw),
                        tool_id=payload.get("call_id"),
                        model=model,
                        step=current_turn,
                    )
                )
                turn_of.append(current_turn)
                continue

            if pt == "tool_search_call":
                # 동적 툴 탐색 — 에이전트가 어떤 도구가 있는지 찾는 행위 자체가 관측 대상이다.
                pending.append(
                    Event(
                        "tool",
                        ts,
                        payload.get("call_id", ""),
                        tool="tool_search",
                        args=_args(payload.get("arguments")),
                        tool_id=payload.get("call_id"),
                        model=model,
                        step=current_turn,
                    )
                )
                turn_of.append(current_turn)
                continue

            if pt == "tool_search_output":
                cid = payload.get("call_id")
                if cid:
                    found = payload.get("tools") or []
                    outputs[cid] = (
                        f"{len(found)} tools: "
                        + ", ".join(str(x.get("name")) for x in found[:8] if isinstance(x, dict)),
                        not found,
                    )
                continue

            if pt == "message":
                role = payload.get("role")
                text = _text(payload.get("content")).strip()
                if not text:
                    continue
                if role == "user":
                    if _is_injected(text):
                        continue
                    pending.append(Event("user", ts, o.get("id", ""), text=text, model=model))
                    turn_of.append(current_turn)
                elif role == "assistant":
                    pending.append(Event("answer", ts, o.get("id", ""), text=text, model=model))
                    turn_of.append(current_turn)
                # role == "developer" 는 시스템이 끼워 넣은 지시다. 사용자 요청이 아니다.
                continue

            # reasoning 은 암호화되어 있고 서사에 넣을 수 없다. 건너뛴다.

    # 결과·소요시간·usage 를 붙인다.
    #
    # 소요시간: 기록된 것은 턴 총계뿐이므로 턴 총계만 쓴다.
    # 호출 단위는 0 으로 둔다 — Codex 워터폴이 요청 단위 granularity 인 것은
    # 우리 한계가 아니라 기록의 한계이고, 그걸 감추면 없는 정밀도를 파는 것이다.
    #
    # 붙이는 자리는 그 턴의 **첫 답변**이다.
    # 답변이 없으면 턴의 첫 이벤트에 붙인다. 도구 호출에 흘려 넣으면 도구가 하지 않은
    # 일을 도구가 한 것처럼 보인다.
    #
    # 토큰도 같은 자리에 붙인다. 단 **사용자 메시지에는 붙일 수 없다** — 사용자가
    # 타이핑한 것은 토큰을 쓰지 않으므로 코어가 그 턴의 비용을 0 으로 지운다.
    # 토큰을 쓴 것은 모델 호출이다.
    remainder_at: dict[str, int] = {}
    for i, ev in enumerate(pending):
        tid = turn_of[i] if i < len(turn_of) else ""
        if ev.kind == "answer" and tid not in remainder_at:
            remainder_at[tid] = i
    for i, ev in enumerate(pending):
        tid = turn_of[i] if i < len(turn_of) else ""
        if ev.kind != "user":
            remainder_at.setdefault(tid, i)

    billed: set[str] = set()
    for i, ev in enumerate(pending):
        if ev.tool_id and ev.tool_id in outputs:
            ev.result, ev.is_error = outputs[ev.tool_id]
        tid = turn_of[i] if i < len(turn_of) else ""

        # 소요시간과 토큰은 둘 다 턴 단위 실측이므로 **같은 자리에 한 번만** 붙인다.
        # 사용자 메시지에 붙이면 코어가 그 턴의 비용을 0 으로 지운다 (사용자가
        # 타이핑한 것은 토큰을 쓰지 않으므로 그 규칙 자체는 맞다).
        target = remainder_at.get(tid) == i
        ev.duration_ms = turn_ms.get(tid, 0) if target else 0
        usage = last_usage.get(tid)
        if usage and target and tid not in billed:
            cached = int(usage.get("cached_input_tokens") or 0)
            total_in = int(usage.get("input_tokens") or 0)
            ev.usage = {
                "cache_read_input_tokens": cached,
                # Codex 의 input_tokens 는 캐시를 포함한 총량이다. 새로 지불한 것만 남긴다.
                "input_tokens": max(0, total_in - cached),
                "cache_creation_input_tokens": 0,
                "output_tokens": int(usage.get("output_tokens") or 0)
                + int(usage.get("reasoning_output_tokens") or 0),
            }
            billed.add(tid)
        yield ev


def project_name(path: Path) -> str:
    """`session_meta.cwd` 의 마지막 조각. 없으면 파일 날짜 디렉터리로 대체한다."""
    try:
        with path.open(encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if '"session_meta"' not in line:
                    continue
                o = json.loads(line)
                cwd = ((o.get("payload") or {}).get("cwd")) or ""
                if cwd:
                    return Path(cwd).name or "unknown"
                break
    except (json.JSONDecodeError, OSError):
        pass
    return "codex"


def discover(root: Path, min_size: int) -> list[Path]:
    return sorted(
        (p for p in root.rglob("rollout-*.jsonl") if p.stat().st_size >= min_size),
        key=lambda p: -p.stat().st_mtime_ns,
    )
