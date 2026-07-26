# 빠른 시작

목표는 패키지를 설치하는 것이 아니라 **실제 trace 하나를 화면에서 여는 것**입니다.

## 요구 사항

- Node.js 20 이상과 pnpm
- Python 3.12 이상과 uv
- Claude Code·Codex session import를 쓸 경우 해당 도구가 만든 로컬 JSONL

## 1. 워크스페이스 실행

```bash
pnpm --dir web install
pnpm --dir web dev
```

`http://localhost:3000`을 열면 실데이터가 없을 때만 합성 demo trace가 보입니다.

## 2A. Claude Code·Codex session 가져오기

가장 빠른 평가 경로입니다. 원본 session 파일을 수정하지 않습니다.

```bash
cd agent
uv sync
uv run python -m kibitz_ingest.cli --source all --limit 8
```

CLI는 조건에 맞는 파일을 최근 수정 순으로 읽고, 기존 출력과 trace id로 병합합니다.
기본 상한은 run당 observation 2,000개입니다. 상한을 넘으면 trace에 `truncation`이
기록되고 화면에도 표시됩니다.

```bash
uv run python -m kibitz_ingest.cli --source codex --max-turns 4000
uv run python -m kibitz_ingest.cli --source claude-code --replace
```

`--replace`는 기존 snapshot을 버리고 이번 결과만 남깁니다.

## 2B. 직접 만든 Python agent 계측

```python
from kibitz_sdk import trace, tool

@tool
def search(query: str) -> list[dict]:
    return db.search(query)

with trace(
    "monthly-report",
    agent="sales-reporter",
    session_id="session-42",
    user_id="user-7",
    tags=["production"],
) as run:
    with run.request("3분기 매출을 정리해줘"):
        rows = search("revenue 2026 Q3")
        run.answer(summarize(rows), input_tokens=1200, output_tokens=180)
```

기본 파일 위치는 **agent 프로세스의 현재 작업 디렉터리** 아래
`.kibitz/traces`입니다. 웹 앱과 다른 디렉터리에서 실행하면 공유 절대 경로를
명시하세요.

```bash
export KIBITZ_DATA_DIR=/absolute/path/to/kibitz/web/.kibitz/traces
```

원격 서버로 보낼 때:

```bash
export KIBITZ_URL=https://kibitz.internal
export KIBITZ_INGEST_TOKEN=replace-me
```

HTTP 전송이 실패하면 SDK는 agent를 중단시키지 않고 로컬 파일로 fallback합니다.

## 2C. HTTP 수집

Python이 아닌 런타임은 완성된 Kibitz Run JSON을 전송합니다.

```bash
curl http://localhost:3000/api/traces \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $KIBITZ_INGEST_TOKEN" \
  --data-binary @trace.json
```

- 하나의 Run 또는 Run 배열
- 요청당 최대 8MB
- `KIBITZ_INGEST_TOKEN`을 설정하지 않으면 로컬 개발을 위해 인증 없이 열림
- 네트워크에 노출할 때는 반드시 token 또는 reverse proxy 인증 사용

## 3. 성공 확인

1. `/traces`에서 실제 trace id를 찾습니다.
2. trace를 열어 request group과 nested observation을 확인합니다.
3. SDK가 보낸 `sessionId`, `userId`, `tags`가 그대로 보이는지 확인합니다.
4. 새 trace를 POST한 뒤 새로고침해 즉시 목록에 나타나는지 확인합니다.

실데이터가 하나라도 있으면 합성 demo trace는 목록에 섞이지 않습니다.

