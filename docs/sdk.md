# 코드로 만든 에이전트 계측

Claude Code·Codex 는 세션 기록을 남기므로 사후에 읽으면 됩니다
([ingestion.md](./ingestion.md)). 직접 코드로 만든 에이전트는 그런 기록이 없으니
계측해야 합니다.

## 설치

```bash
cd agent && uv sync
```

SDK 는 `kibitz_ingest` 를 재사용합니다. **탐지 규칙은 한 벌뿐입니다** — 규칙을 SDK 에
복제하면 "SDK 트레이스의 판정과 Claude Code 트레이스의 판정이 다르다"가 되고,
그러면 둘을 나란히 볼 이유가 없어집니다.

## 최소 예시

```python
from kibitz_sdk import trace, tool

@tool
def search(query: str) -> list[str]:
    return db.search(query)

@tool
def get_record(record_id: str) -> dict:
    return db.get(record_id)

with trace("월간 리포트", agent="sales-reporter", model="claude-opus-5") as run:
    with run.request("3분기 매출 정리해줘"):
        ids = search("revenue 2026 Q3")
        rows = [get_record(i) for i in ids]
        run.answer(summarize(rows), input_tokens=1200, output_tokens=180)
```

기본으로 **agent 프로세스의 현재 작업 디렉터리** 아래 `.kibitz/traces/`에 파일로
씁니다. 웹 앱을 다른 디렉터리에서 실행하면 자동으로 같은 위치가 되지 않습니다.
두 프로세스에 같은 절대 경로를 지정하세요.

```bash
export KIBITZ_DATA_DIR=/absolute/path/to/shared/traces
```

## 구조가 화면에 어떻게 나타나는가

| 코드 | 관측 | 화면 |
|---|---|---|
| `trace(...)` | 트레이스 하나 | `/traces` 의 한 행 |
| `run.request(text)` | `chain` 루트 | 접을 수 있는 요청 묶음 |
| `@tool` / `run.span(...)` | `tool` · `retriever` | 묶음 아래 관측 |
| `run.answer(text)` | `llm` | 최종 답변 |

`run.request()` 가 중요합니다. 요청 경계가 곧 묶음이고, 이게 있으면 긴 실행이
훑을 수 있는 단위로 접힙니다.

## 토큰과 비용

**응답에 온 값만 넣으세요.** 추정하지 마세요.

```python
with run.span("draft") as s:
    resp = client.messages.create(...)
    s.set_result(resp.content[0].text)
    s.set_usage(
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        cache_read=resp.usage.cache_read_input_tokens,
    )
```

비워 두면 그 관측의 비용이 0 으로 남습니다. 지어낸 숫자보다 그게 낫습니다 —
비용 화면 하나가 틀리면 나머지 숫자도 못 믿게 됩니다.

## LangChain / LangGraph

```python
from kibitz_sdk import trace
from kibitz_sdk.langchain import KibitzCallback

with trace("문서 질의", agent="doc-qa") as run:
    result = graph.invoke(
        {"question": q},
        config={"callbacks": [KibitzCallback(run)]},
    )
```

`on_tool_start/end`, `on_llm_end` 의 usage, 각 단계의 실패를 기록합니다.
**프롬프트 전문은 기본으로 기록하지 않습니다** — 민감한 입력이 트레이스 파일에
쌓이기 때문입니다. 필요하면 `KibitzCallback(run, record_prompts=True)`.

`langchain-core` 가 없어도 SDK 는 import 됩니다. LangChain 을 안 쓰는 사람이
설치할 이유가 없습니다.

## 원격 서버로 보내기

```bash
export KIBITZ_URL=https://kibitz.internal
export KIBITZ_INGEST_TOKEN=...        # 서버가 요구할 때만
```

또는 코드에서:

```python
from kibitz_sdk import KibitzClient
client = KibitzClient(url="https://kibitz.internal")
with trace("...", client=client) as run: ...
```

전송이 실패하면 **파일로 떨어뜨립니다.** 예외를 던지지 않습니다 —
옵저버빌리티가 관측 대상을 멈추게 하면 도구가 아니라 장애 원인입니다.

## 예외가 났을 때

트레이스를 잃지 않습니다. `with` 블록을 벗어날 때 무조건 전송하고, 실패한 span 은
`is_error` 로 남습니다. 터지기 직전에 무엇을 했는지가 가장 궁금한 정보입니다.

```python
with trace("...", agent="x") as run:
    with run.request("..."):
        risky()        # 여기서 터져도 트레이스는 남는다
```

## 동시성

열린 trace는 mutable process 전역 stack이 아니라 `ContextVar`에 저장됩니다. 서로 다른
async task와 thread가 동시에 trace를 열어도 context가 섞이지 않습니다. `@tool`은 일반
함수와 coroutine function을 모두 감싸며, 각각 현재 task의 trace에 span을 기록합니다.

한 run은 기본 observation 2,000개까지 변환합니다. 초과하면 조용히 버리지 않고
`truncation.captured`와 `truncation.available`을 저장해 화면에 표시합니다.

## HTTP 로 직접

SDK 없이도 됩니다. 완성된 트레이스를 POST 하세요:

```bash
curl -X POST http://localhost:3000/api/traces \
  -H 'content-type: application/json' \
  -d @trace.json
```

```
POST /api/traces   트레이스 하나 또는 배열 → { accepted: [...], rejected: [...] }
GET  /api/traces   저장된 것 요약 (본문은 돌려주지 않음)
```

서버는 **저장만** 합니다. 탐지는 SDK 쪽(`kibitz_ingest`)에서 돌아갑니다 —
규칙을 TypeScript 로 옮기면 두 구현이 생기고 반드시 갈라지기 때문입니다.

## TypeScript

Node.js agent는 [`../sdk/typescript`](../sdk/typescript)의 `@kibitz/sdk`를 사용합니다.
`AsyncLocalStorage`로 concurrent request를 격리하고 `trace`, `request`, `span`,
`instrument`를 제공합니다.
