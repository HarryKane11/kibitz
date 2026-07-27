# 실시간 트레이싱 (OpenTelemetry)

돌고 있는 에이전트를 지켜봅니다. Langfuse·Phoenix 로 이미 계측해 둔 코드는
**host 만 바꾸면** 들어옵니다.

## 엔드포인트

| 경로 | 왜 있나 |
|---|---|
| `POST /api/otel/v1/traces` | 표준 OTLP/HTTP. `OTEL_EXPORTER_OTLP_ENDPOINT=<host>/api/otel` |
| `POST /api/otel` | base 경로에 그대로 쏘는 exporter |
| `POST /api/public/otel/v1/traces` | **Langfuse 와 같은 경로** |
| `POST /api/public/otel` | Langfuse base 경로 |

핸들러는 하나입니다. 경로가 여럿인 것은 기능이 여럿이어서가 아니라, 기존 계측을
그대로 쓰게 하려는 것입니다.

**JSON 만 받습니다.** protobuf 와 gRPC 는 아직입니다 —
`OTEL_EXPORTER_OTLP_PROTOCOL=http/json` 으로 두세요. (Langfuse 도 gRPC 는 안 받습니다.)

인증은 `Bearer` 와 `Basic` 둘 다 받습니다. Langfuse 로 계측한 코드는 Basic 을 쓰므로
`KIBITZ_INGEST_TOKEN` 을 그 자리에 넣으면 됩니다.

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000/api/otel
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
# 토큰을 설정했다면
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer $KIBITZ_INGEST_TOKEN"
```

## 배치가 이어 들어와도 잃지 않습니다

`BatchSpanProcessor` 는 몇 초마다 flush 합니다. 즉 돌고 있는 에이전트의 스팬은
**여러 번에 나눠** 도착합니다. 수신부는 이렇게 처리합니다:

1. 배치의 스팬을 traceId 별 JSONL 에 **덧붙인다**
2. 그 트레이스의 **누적 스팬 전체**로 Run 을 다시 만든다
3. Run 을 저장한다

2번이 "이 배치만" 보면 두 번째 flush 가 첫 flush 를 지웁니다 — 살아 있는 런을 보면
마지막 몇 초만 남습니다. 그건 기능 부재가 아니라 데이터 유실이고, 그래서 저장 단위를
Run 이 아니라 스팬으로 내렸습니다.

덧붙이기라서 **수집이 멱등**합니다. 같은 배치를 두 번 보내도 결과가 같습니다
(`spanId` 로 중복 제거, 나중 것이 이깁니다).

```
batch 1 (2 spans) → {"spans": 2, "open": true}
batch 2 (3 spans) → {"spans": 5, "open": true}    ← 누적. 3 이 아니다.
batch 3 (root)    → {"spans": 6, "open": false}   ← 루트가 닫히면 완료
```

## "아직 돌고 있다"

루트 스팬이 닫히지 않았으면 `open: true` 입니다. 화면은 이걸 판정과 섞지 않습니다 —
`status` 는 "잘했나"이고 `open` 은 "끝났나"입니다. 진행 중인 런에 정확도를 확정해
붙이면 그 숫자가 거짓이 됩니다.

- 사이드바에 `N 실행 중` 이 뜹니다.
- 트레이스 화면은 상태 대신 **아직 실행 중** 을 보여줍니다.
- 화면이 `GET /api/live` 를 폴링해 수집 버전이 바뀔 때만 다시 그립니다.
  열린 런이 있으면 2초, 없으면 15초, 탭이 숨으면 멈춥니다.

SSE 가 아니라 폴링인 이유: 셀프호스팅은 리버스 프록시 뒤에 있는 경우가 많고 일부는
SSE 를 버퍼링합니다. 그러면 "실시간"이 조용히 30초 지연으로 바뀌고 사용자는 이유를
알 수 없습니다. 이 응답은 파일 mtime 만 보므로 2초 폴링이 쌉니다.

## 읽는 속성 (규약 우선순위)

한 필드를 한 규약에서만 읽으면 그 계측기를 쓰는 사람만 값을 보고 나머지는 빈칸을
봅니다. Langfuse 가 정한 순서를 그대로 씁니다:

**`langfuse.*` → OpenInference(Phoenix) → OTel GenAI → 예전 `llm.*`**

| 무엇 | 읽는 키 |
|---|---|
| 관측 종류 | `openinference.span.kind`, `langfuse.observation.type` |
| 입력 | `langfuse.observation.input`, `input.value`, `mlflow.spanInputs`, `gen_ai.prompt` |
| 출력 | `langfuse.observation.output`, `output.value`, `mlflow.spanOutputs`, `gen_ai.completion` |
| 모델 | `gen_ai.request.model`, `llm.model_name`, `gen_ai.response.model` |
| 입력 토큰 | `gen_ai.usage.input_tokens`, `llm.token_count.prompt` |
| 출력 토큰 | `gen_ai.usage.output_tokens`, `llm.token_count.completion` |
| 캐시 | `llm.token_count.prompt_details.cache_read` / `cache_write` |
| 비용 | `langfuse.observation.cost_details.total`, `gen_ai.usage.cost` |
| 세션 | `langfuse.session.id`, `session.id`, `gen_ai.conversation.id` |
| 사용자 | `langfuse.user.id`, `user.id` |

`openinference.span.kind` 는 이름 추측보다 먼저 봅니다 — 계측기가 이미 답을 알고
있는데 정규식으로 다시 맞히려 들면 그쪽이 틀립니다.

OpenInference 종류 → Kibitz 관측 종류: `LLM`·`EMBEDDING`→llm, `CHAIN`·`PROMPT`→chain,
`RETRIEVER`·`RERANKER`→retriever, `TOOL`·`GUARDRAIL`·`EVALUATOR`→tool, `AGENT`→agent.

## 아직 아닌 것

- **protobuf / gRPC** — JSON 만.
- **탐지 규칙** — OTLP 로 들어온 트레이스는 지금 오류 스팬만 판정합니다. 여섯 규칙은
  `agent/kibitz_ingest` 에 있고 코드 에이전트 기록의 모양을 전제합니다. OTLP 스팬에
  같은 규칙을 돌리려면 인자 해시를 스팬 속성에서 만들어야 합니다.
- **보존 정책** — 오래된 트레이스를 지우지 않습니다. 저장소 규모는
  [self-hosting.md](./self-hosting.md) 를 보세요.
