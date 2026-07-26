# Kibitz Agent Package

Kibitz의 Python 수집 도구입니다.

- `kibitz_sdk` — 직접 만든 Python agent를 계측
- `kibitz_ingest` — Claude Code·Codex JSONL session을 trace로 변환
- `kibitz_mcp` — 저장된 trace를 읽는 MCP server

## 설치

```bash
cd agent
uv sync
```

## 가장 빠른 확인

```bash
uv run python -m kibitz_ingest.cli --source all --limit 8
```

직접 만든 agent:

```python
from kibitz_sdk import trace, tool

@tool
def lookup(key: str):
    return store.get(key)

with trace("example", agent="worker") as run:
    with run.request("Find the record"):
        run.answer(str(lookup("42")))
```

상세: [`../docs/quickstart.md`](../docs/quickstart.md),
[`../docs/sdk.md`](../docs/sdk.md), [`../docs/ingestion.md`](../docs/ingestion.md).

## 검증

```bash
uv run python -m unittest discover -s tests
```

Python SDK는 동기·async 함수 모두 계측합니다. `ContextVar`가 열린 trace stack을
task/thread context별로 격리하므로 동시에 실행되는 agent가 서로의 span을 가져가지
않습니다.
