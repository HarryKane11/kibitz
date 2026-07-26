# Langfuse에서의 이전과 공존

Kibitz의 목표는 장기 실행 agent를 위한 오픈소스 tracing으로 Langfuse의 핵심 조사
workflow를 대체하는 것입니다. SDK 이름만 바꾸는 drop-in 방식 대신, Langfuse v4의
권장 observation export와 OTLP/HTTP JSON을 수용합니다.

## 개념 대응

| Langfuse | Kibitz | 현재 상태 |
|---|---|---|
| Trace | Run / Trace | Core |
| Observation / Span | Observation / Turn | Core |
| Session | Session | Core, trace metadata에서 파생 |
| User | User | Core, trace metadata에서 파생 |
| Score | Derived score | Core, trace에서 결정론적으로 파생 |
| Evaluator | Evaluator + resource API | 영속 |
| Annotation queue | Annotation screen + 저장 action | 영속 |
| Dataset / experiment | Dataset + resource API | 영속 |
| Prompt management | Prompt version explorer + resource API | 영속 |

## Kibitz가 추가하는 장기 run 객체

- request boundary 기반 접기
- 반복 호출을 되돌아가는 호로 나타내는 decision path
- cache와 context 변화
- 원인이 된 observation에 붙는 evidence-backed finding
- 관측값 → 규칙 → counterfactual
- Claude Code·Codex local session import
- Langfuse `observations_v2` JSON·JSONL import

## 안전한 도입 순서

1. 기존 Langfuse 계측을 유지합니다.
2. `kibitz-langfuse-import`로 대표적인 긴 run을 Kibitz에 가져옵니다.
3. 직접 만든 Python·TypeScript agent 하나 또는 OTLP exporter를 Kibitz에 연결합니다.
4. 같은 `sessionId`, `userId`, `tags`를 두 시스템에 보냅니다.
5. trace 누락·token·latency·metadata를 대조합니다.
6. 필요한 운영 기능이 모두 Core인지 확인한 뒤 기존 수집을 제거합니다.

이전 기간에는 기존 Langfuse 계측을 유지하고, OTLP exporter를 복수 destination으로
보내거나 `observations_v2` export를 주기적으로 가져오는 방식을 권장합니다.

## 이전 경로

- `uv run kibitz-langfuse-import observations_v2.jsonl`
- OTLP/HTTP JSON: exporter base endpoint를 `/api/otel`로 설정
- Prompt·dataset·evaluator·queue·automation: `/api/resources/[kind]`에 JSON으로 이전
- Project isolation: `KIBITZ_PROJECT_TOKENS`에서 read·ingest·admin token을 project에 매핑
- 다중 replica: 동일 RWX trace/resource directory를 mount

Langfuse SDK 호환 facade와 OTLP protobuf/gRPC transport가 필요한 설치는 이전 기간에
OTLP/HTTP JSON 또는 export importer를 사용합니다.
