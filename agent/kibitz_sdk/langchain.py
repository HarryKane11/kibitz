"""
LangChain / LangGraph 콜백 핸들러.

    from kibitz_sdk import trace
    from kibitz_sdk.langchain import KibitzCallback

    with trace("문서 질의", agent="doc-qa") as run:
        handler = KibitzCallback(run)
        result = graph.invoke({"question": q}, config={"callbacks": [handler]})

`langchain-core` 가 없어도 이 모듈을 import 할 수 있게 만들었다 — SDK 본체가
LangChain 에 의존하면 LangChain 을 안 쓰는 사람도 설치해야 한다.

기록하는 것:
  on_tool_start/end     도구 호출 → 관측 (인자 그대로 → repeated-call 규칙이 동작한다)
  on_llm_end            토큰 usage → **응답에 온 값만**. 없으면 비워 둔다.
  on_chain_error 등     실패를 is_error 로

기록하지 않는 것:
  프롬프트 전문. 필요하면 `record_prompts=True` 로 켠다 — 기본으로 켜 두면
  민감한 입력이 트레이스 파일에 그대로 쌓인다.
"""

from __future__ import annotations

import time
from typing import Any, Sequence
from uuid import UUID

from kibitz_sdk.tracer import Run, Span

try:  # pragma: no cover - 있으면 쓰고 없으면 최소 기반 클래스를 쓴다
    from langchain_core.callbacks import BaseCallbackHandler
except ImportError:  # pragma: no cover
    class BaseCallbackHandler:  # type: ignore[no-redef]
        """langchain-core 가 없을 때의 자리. import 만 되게 한다."""


class KibitzCallback(BaseCallbackHandler):
    """LangChain 실행을 Kibitz 관측으로."""

    def __init__(self, run: Run, *, record_prompts: bool = False) -> None:
        self.run = run
        self.record_prompts = record_prompts
        # run_id → 열린 Span. LangChain 은 start/end 를 run_id 로 짝지어 준다.
        self._open: dict[UUID, Span] = {}

    # ── 도구 ──────────────────────────────────────────────────

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        inputs: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name") or "tool"
        # `inputs` 가 있으면 그게 구조화된 인자다. 없으면 문자열이라도 남긴다 —
        # 해시가 안정적이어야 반복 호출을 잡을 수 있다.
        args = dict(inputs) if inputs else {"input": input_str}
        self._open[run_id] = Span(name=name, kind="tool", args=args)

    def on_tool_end(self, output: Any, *, run_id: UUID, **kwargs: Any) -> None:
        span = self._open.pop(run_id, None)
        if span is None:
            return
        span.set_result(output)
        self.run._close(span)

    def on_tool_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        span = self._open.pop(run_id, None)
        if span is None:
            return
        span.set_result(f"{type(error).__name__}: {error}", error=True)
        self.run._close(span)

    # ── 모델 ──────────────────────────────────────────────────

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name") or "llm"
        args: dict[str, Any] = {}
        if self.record_prompts and prompts:
            args["prompt"] = prompts[0]
        self._open[run_id] = Span(name=name, kind="tool", args=args)

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: Sequence[Sequence[Any]],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name") or "chat_model"
        args: dict[str, Any] = {}
        if self.record_prompts and messages and messages[0]:
            args["messages"] = [getattr(m, "content", str(m)) for m in messages[0]]
        self._open[run_id] = Span(name=name, kind="tool", args=args)

    def on_llm_end(self, response: Any, *, run_id: UUID, **kwargs: Any) -> None:
        span = self._open.pop(run_id, None)
        if span is None:
            return

        text = ""
        generations = getattr(response, "generations", None) or []
        if generations and generations[0]:
            text = getattr(generations[0][0], "text", "") or ""
        span.set_result(text)

        # usage 는 **응답에 온 것만** 쓴다. 토큰을 세거나 추정하지 않는다 —
        # 추정값을 비용으로 보여주면 그 화면 전체를 못 믿게 된다.
        usage = _usage_of(response)
        if usage:
            span.set_usage(**usage)
        self.run._close(span)

    def on_llm_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        span = self._open.pop(run_id, None)
        if span is None:
            return
        span.set_result(f"{type(error).__name__}: {error}", error=True)
        self.run._close(span)

    # ── 체인 / 그래프 노드 ─────────────────────────────────────

    def on_chain_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        span = self._open.pop(run_id, None)
        if span is not None:
            span.set_result(f"{type(error).__name__}: {error}", error=True)
            self.run._close(span)


def _usage_of(response: Any) -> dict[str, int]:
    """LLMResult 에서 토큰을 꺼낸다. 제공자마다 자리가 달라 알려진 곳들을 훑는다."""
    raw = getattr(response, "llm_output", None) or {}
    usage = raw.get("usage") or raw.get("token_usage") or raw.get("usage_metadata") or {}

    if not usage:
        gens = getattr(response, "generations", None) or []
        if gens and gens[0]:
            msg = getattr(gens[0][0], "message", None)
            usage = getattr(msg, "usage_metadata", None) or {}

    if not usage:
        return {}

    details = usage.get("input_token_details") or {}
    return {
        "input_tokens": int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or usage.get("completion_tokens") or 0),
        "cache_read": int(details.get("cache_read") or usage.get("cache_read_input_tokens") or 0),
        "cache_write": int(
            details.get("cache_creation") or usage.get("cache_creation_input_tokens") or 0
        ),
    }
