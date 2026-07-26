"""
Claude Code 어댑터.

세션 기록: `~/.claude/projects/**/*.jsonl`

이 형식의 함정 두 가지가 여기 담겨 있다:
 1. **툴 결과가 user 라인에 실려 온다.** 중첩 content 를 펼치면 툴 출력이 사용자
    발화로 새어 들어가 요청 27건이 65건으로 보인다 → `spoken_text()`.
 2. **소요시간이 기록되지 않는다.** 이벤트 간격으로 추론해야 하고, 그 간격에는
    사람이 자리를 비운 시간이 섞인다 (실측에서 66시간짜리 간격이 나왔다).
    `Event.duration_ms` 를 비워 두면 코어가 걸러낸다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

from kibitz_ingest.core import ATTACHMENT_RE, INTERRUPT_RE, canonical, parse_ts, sha
from kibitz_ingest.event import Event

SOURCE = "claude-code"
DEFAULT_ROOT = Path.home() / ".claude" / "projects"


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


def read_events(path: Path) -> Iterator[Event]:
    """jsonl을 스트리밍으로 읽는다. 세션 파일은 수십 MB가 될 수 있다."""
    results: dict[str, tuple[str, bool]] = {}
    pending: list[Event] = []

    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue

            typ = o.get("type")
            ts = parse_ts(o.get("timestamp"))
            uuid = o.get("uuid", "")
            side = bool(o.get("isSidechain"))
            msg = o.get("message") or {}
            content = msg.get("content")

            # 툴 결과는 user 라인에 실려 온다 — 먼저 색인
            tur = o.get("toolUseResult")
            if isinstance(tur, dict):
                tid = tur.get("tool_use_id")
                if tid:
                    results[tid] = (flatten(tur.get("content")), bool(tur.get("is_error")))
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_result":
                        tid = b.get("tool_use_id")
                        if tid:
                            results[tid] = (flatten(b.get("content")), bool(b.get("is_error")))

            if typ == "user" and o.get("promptId"):
                text = spoken_text(content).strip()
                if text and not text.startswith("<"):
                    kind = (
                        "attachment" if ATTACHMENT_RE.match(text)
                        else "interrupt" if INTERRUPT_RE.match(text)
                        else "user"
                    )
                    pending.append(Event(kind, ts, uuid, text=text, sidechain=side))

            elif typ == "assistant" and isinstance(content, list):
                usage = msg.get("usage") or {}
                model = msg.get("model")
                said = flatten(content).strip()
                calls = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]
                if calls:
                    for k, b in enumerate(calls):
                        pending.append(
                            Event(
                                "tool",
                                ts,
                                uuid,
                                text=said,
                                tool=b.get("name"),
                                args=b.get("input") or {},
                                tool_id=b.get("id"),
                                usage=usage,
                                model=model,
                                sidechain=side,
                                step=uuid,
                                bills_usage=(k == 0),
                            )
                        )
                elif said:
                    pending.append(
                        Event("answer", ts, uuid, text=said, usage=usage, model=model, sidechain=side)
                    )

    for ev in pending:
        if ev.tool_id and ev.tool_id in results:
            ev.result, ev.is_error = results[ev.tool_id]
        yield ev




def project_name(path: Path) -> str:
    """디렉터리 이름에서 프로젝트를 짐작한다. Claude Code 는 경로를 인코딩해 둔다."""
    raw = path.parent.name.lstrip("-")
    return raw.split("-")[-1] or "unknown"


def discover(root: Path, min_size: int) -> list[Path]:
    return sorted(
        (p for p in root.rglob("*.jsonl") if p.stat().st_size >= min_size),
        key=lambda p: -p.stat().st_mtime_ns,
    )
