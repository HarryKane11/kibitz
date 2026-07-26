"""어댑터가 채워 넣는 공용 이벤트 계약."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

@dataclass
class Event:
    kind: str  # "user" | "tool" | "answer"
    ts: datetime | None
    uuid: str
    text: str = ""
    parent_uuid: str | None = None
    tool: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    tool_id: str | None = None
    result: str = ""
    is_error: bool = False
    usage: dict[str, Any] = field(default_factory=dict)
    # 실제 model call에 전달된 message 식별자. 제공되는 runtime에서만 채운다.
    message_ids: list[str] = field(default_factory=list)
    model: str | None = None
    sidechain: bool = False
    # 같은 assistant 메시지에서 나온 호출들은 이 값이 같다.
    step: str = ""
    # 기록에 소요시간이 직접 있으면 여기 담는다 (Codex 의 duration_ms 등).
    # None 이면 코어가 이벤트 간격에서 추론하고, 사람이 자리를 비운 시간을 걸러낸다.
    duration_ms: int | None = None
    # 한 메시지가 여러 툴을 부를 때, 토큰은 첫 호출에만 실린다.
    # usage 는 메시지 단위 실측값이라 호출마다 복제하면 그만큼 중복 계상된다.
    bills_usage: bool = True
