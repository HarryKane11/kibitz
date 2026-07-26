"""
Kibitz SDK — 직접 만든 에이전트를 계측한다.

Claude Code·Codex 는 기록을 남기므로 사후에 읽으면 된다. 코드로 만든 에이전트는
그런 기록이 없으니 직접 남겨야 한다. 이 모듈이 그 일을 한다.

    from kibitz_sdk import trace, tool

    with trace("월간 리포트를 만든다", agent="sales-reporter") as run:
        with run.request("3분기 매출 정리해서 슬랙에 올려줘"):
            rows = fetch_sales(run)          # @tool 이 붙어 있으면 자동 기록
            run.answer(summarize(rows))

핵심 설계 하나: **탐지 규칙을 여기 옮겨 쓰지 않는다.** `kibitz_ingest` 의 것을
그대로 import 한다. 규칙을 두 곳에 두면 "SDK 로 보낸 트레이스와 Claude Code 트레이스의
판정이 다르다"가 되고, 그러면 둘을 나란히 볼 이유가 없어진다.
"""

from kibitz_sdk.client import KibitzClient
from kibitz_sdk.tracer import Run, Span, tool, trace

__all__ = ["KibitzClient", "Run", "Span", "trace", "tool"]
