"""
계측 API.

    trace(...)      한 번의 실행 = 한 트레이스
      run.request() 사용자 요청 하나 = 묶음의 뿌리 (chain)
        run.span()  도구 호출·모델 호출 = 그 아래 관측
      run.answer()  최종 답변

`@tool` 데코레이터는 함수 호출을 span 으로 감싼다. 인자와 반환값을 그대로 기록하므로
`repeated-call` 같은 규칙이 SDK 트레이스에서도 그대로 동작한다 — 규칙이 보는 것은
`hash(도구명, 인자)` 이고, 그 재료를 여기서 만들어 준다.

에이전트 코드에 예외가 났을 때 트레이스를 잃지 않는다. `__exit__` 에서 무조건 flush 하고,
실패한 span 은 `is_error` 로 남긴다 — 터지기 직전에 무엇을 했는지가 가장 궁금한 정보다.
"""

from __future__ import annotations

import functools
import inspect
import json
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Iterator, TypeVar, cast

from kibitz_ingest.build import build_run
from kibitz_ingest.event import Event
from kibitz_sdk.client import KibitzClient

F = TypeVar("F", bound=Callable[..., Any])

# 지금 실행 컨텍스트에 열린 Run. ContextVar라 async task와 thread가 서로의 trace를
# 오염시키지 않는다. tuple을 쓰는 이유는 자식 task가 부모의 mutable stack을 공유하지
# 않게 하기 위해서다.
_CURRENT: ContextVar[tuple["Run", ...]] = ContextVar("kibitz_current_runs", default=())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _short(value: Any, limit: int = 2000) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            text = repr(value)
    return text if len(text) <= limit else text[:limit] + "…"


@dataclass
class Span:
    """열려 있는 관측 하나. 닫힐 때 소요시간이 확정된다."""

    name: str
    kind: str  # "tool" | "answer"
    args: dict[str, Any] = field(default_factory=dict)
    started: float = field(default_factory=time.perf_counter)
    result: str = ""
    is_error: bool = False
    usage: dict[str, Any] = field(default_factory=dict)
    message_ids: list[str] = field(default_factory=list)
    _ts: datetime = field(default_factory=_now)

    def set_result(self, value: Any, *, error: bool = False) -> None:
        self.result = _short(value)
        self.is_error = error

    def set_usage(
        self,
        *,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read: int = 0,
        cache_write: int = 0,
    ) -> None:
        """모델 호출의 토큰. **추정하지 말고 응답에 온 값을 그대로 넣는다.**

        비워 두면 그 관측의 비용이 0 으로 남는다 — 지어낸 숫자보다 그게 낫다.
        """
        self.usage = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_input_tokens": cache_read,
            "cache_creation_input_tokens": cache_write,
        }

    def set_context(self, message_ids: list[str]) -> None:
        """이 model/tool call에 실제로 전달된 message id를 기록한다."""
        self.message_ids = list(dict.fromkeys(message_ids))


class Run:
    """한 번의 에이전트 실행."""

    def __init__(
        self,
        title: str,
        *,
        agent: str,
        project: str = "sdk",
        source: str = "sdk",
        model: str = "unknown",
        run_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
        tags: list[str] | None = None,
    ) -> None:
        self.title = title
        self.agent = agent
        self.project = project
        self.source = source
        self.model = model
        self.run_id = run_id or f"sdk_{uuid.uuid4().hex[:8]}"
        self.session_id = session_id
        self.user_id = user_id
        self.tags = tags or []
        self._events: list[Event] = []

    # ── 요청 묶음 ──────────────────────────────────────────────

    @contextmanager
    def request(self, text: str) -> Iterator["Run"]:
        """사용자 요청 하나. 이 안에서 일어난 것이 이 요청 아래로 묶인다.

        묶음은 우리가 만든 게 아니라 요청 경계 그 자체다 — Claude Code 트레이스에서
        요청 단위로 접히는 것과 같은 구조가 여기서도 나온다.
        """
        self._events.append(Event("user", _now(), uuid.uuid4().hex, text=text, model=self.model))
        yield self

    # ── 관측 ──────────────────────────────────────────────────

    @contextmanager
    def span(self, name: str, **args: Any) -> Iterator[Span]:
        """도구 호출 하나. 예외가 나도 span 은 기록된다."""
        s = Span(name=name, kind="tool", args=args)
        try:
            yield s
        except Exception as exc:  # noqa: BLE001 — 계측이 에이전트를 죽이면 안 된다
            s.set_result(f"{type(exc).__name__}: {exc}", error=True)
            self._close(s)
            raise
        else:
            self._close(s)

    def _close(self, s: Span) -> None:
        self._events.append(
            Event(
                "tool" if s.kind == "tool" else "answer",
                s._ts,
                uuid.uuid4().hex,
                text="",
                tool=s.name,
                args=s.args,
                tool_id=uuid.uuid4().hex,
                result=s.result,
                is_error=s.is_error,
                usage=s.usage,
                message_ids=s.message_ids,
                model=self.model,
                duration_ms=int((time.perf_counter() - s.started) * 1000),
            )
        )

    def answer(self, text: str, **usage: int) -> None:
        """모델이 사용자에게 돌려준 것."""
        ev = Event(
            "answer",
            _now(),
            uuid.uuid4().hex,
            text=text,
            model=self.model,
            duration_ms=0,
        )
        if usage:
            ev.usage = {
                "input_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
                "cache_read_input_tokens": usage.get("cache_read", 0),
                "cache_creation_input_tokens": usage.get("cache_write", 0),
            }
        self._events.append(ev)

    # ── 완성 ──────────────────────────────────────────────────

    def to_trace(self, max_turns: int = 2000) -> dict | None:
        """이벤트를 트레이스로. 탐지는 `kibitz_ingest` 가 돌린다 — 규칙은 한 벌뿐이다."""
        run = build_run(
            list(self._events),
            run_id=self.run_id,
            agent=self.agent,
            project=self.project,
            source=self.source,
            max_turns=max_turns,
        )
        if run is None:
            return None
        # SDK 가 아는 것을 덮어쓴다. build_run 은 기록에서 짐작할 뿐이다.
        run["title"] = self.title
        run["titleTail"] = ""
        if self.model != "unknown":
            run["model"] = self.model
        if self.session_id:
            run["sessionId"] = self.session_id
        if self.user_id:
            run["userId"] = self.user_id
        if self.tags:
            run["tags"] = self.tags
        return run


@contextmanager
def trace(
    title: str,
    *,
    agent: str = "agent",
    client: KibitzClient | None = None,
    **kwargs: Any,
) -> Iterator[Run]:
    """한 번의 실행을 감싼다. 블록을 벗어날 때 전송된다.

    예외가 나도 전송한다 — 터진 실행이 가장 보고 싶은 실행이다.
    """
    run = Run(title, agent=agent, **kwargs)
    sink = client or KibitzClient()
    stack = _CURRENT.get()
    token = _CURRENT.set((*stack, run))
    try:
        yield run
    finally:
        _CURRENT.reset(token)
        payload = run.to_trace()
        if payload is not None:
            sink.send(payload)


def tool(fn: F) -> F:
    """함수 호출을 관측으로 기록한다.

        @tool
        def search(query: str) -> list[dict]: ...

    열린 trace 가 없으면 아무것도 하지 않고 그냥 호출한다 — 계측을 넣었다고
    프로덕션 코드가 테스트에서 실패하면 안 된다.
    """

    # 시그니처를 한 번만 읽어 둔다. 호출마다 introspect 하면 뜨거운 경로가 느려진다.
    try:
        sig: inspect.Signature | None = inspect.signature(fn)
    except (TypeError, ValueError):  # 빌트인 등
        sig = None

    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            stack = _CURRENT.get()
            if not stack:
                return await fn(*args, **kwargs)
            run = stack[-1]
            with run.span(fn.__name__, **_name_args(sig, args, kwargs)) as s:
                out = await fn(*args, **kwargs)
                s.set_result(out)
                return out

        return cast(F, async_wrapper)

    @functools.wraps(fn)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        stack = _CURRENT.get()
        if not stack:
            return fn(*args, **kwargs)
        run = stack[-1]
        with run.span(fn.__name__, **_name_args(sig, args, kwargs)) as s:
            out = fn(*args, **kwargs)
            s.set_result(out)
            return out

    return cast(F, sync_wrapper)


def _name_args(
    sig: inspect.Signature | None, args: tuple[Any, ...], kwargs: dict[str, Any]
) -> dict[str, Any]:
    """위치 인자에 **실제 파라미터 이름**을 붙인다.

    `arg0` 로 남기면 화면에 `search(…)` 로 나오고, 무엇을 검색했는지 알 수 없다.
    이름이 붙으면 `search(query="Q3 revenue")` 가 되고 그게 이 호출의 정체다.
    `self` 는 버린다 — 매 호출 달라지는 객체 주소가 해시에 섞이면 같은 호출이
    다른 호출로 보인다.
    """
    if sig is None:
        return {**{f"arg{i}": a for i, a in enumerate(args)}, **kwargs}
    try:
        bound = sig.bind_partial(*args, **kwargs)
    except TypeError:
        return {**{f"arg{i}": a for i, a in enumerate(args)}, **kwargs}
    return {k: v for k, v in bound.arguments.items() if k not in ("self", "cls")}
