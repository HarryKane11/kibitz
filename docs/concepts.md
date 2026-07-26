# 장기 실행 Agent Trace 모델

Kibitz는 span tree를 대체하지 않습니다. raw execution을 보존하면서 장기 run을
조사하는 데 필요한 구조를 추가합니다.

```text
Trace
├─ Request group
│  ├─ Model observation
│  ├─ Tool observation
│  ├─ Retrieval observation
│  ├─ Sub-agent observation
│  └─ Event
└─ Finding
   ├─ observed values
   ├─ deterministic rule
   └─ counterfactual
```

## Trace

에이전트 실행 하나입니다. agent, model, source, 시작 시각, active duration, idle time,
token, 추정 비용, session, user, tag를 가질 수 있습니다.

## Request group

사용자 요청 하나와 다음 요청 전까지의 모든 agent 작업입니다. 수백 observation을
사용자 의도 단위로 접는 경계입니다. SDK에서는 `run.request()`가 이 경계를 만듭니다.

## Observation

실제로 기록된 model·tool·retrieval·sub-agent·event입니다. observation tree와 timing은
그대로 남으며, 함수명·인자·결과·usage·오류 상태를 조사할 수 있습니다.

## Decision path

observation을 시간순 waterfall로만 읽지 않고, agent가 확보한 정보와 되돌아간 호출을
경로로 보여주는 조사 뷰입니다. 저장 포맷을 다시 쓰는 객체가 아니라 trace에서 파생한
표현입니다.

## Finding

현재 인제스터는 여섯 결정론 휴리스틱을 실행합니다.

- 동일 호출 반복
- 2~3개 도구로 이루어진 호출 cycle
- 빈 결과 뒤 동일 인자 재호출
- prefix cache 급락
- 최종 답변의 출처 없는 숫자 리터럴

Finding에는 원인이 된 observation, 관측값, 규칙, counterfactual이 붙습니다. 이는
semantic correctness 평가가 아니라, 기록으로 재현할 수 있는 좁은 운영 진단입니다.

`context-eviction`은 runtime이 실제 model call의 message id를 제공할 때 집합 차로
계산합니다. message id가 없는 adapter에서는 추정하지 않습니다.

## 관측값·파생값·근사값·영속 resource

| 종류 | 예 | 해석 |
|---|---|---|
| 관측값 | tool args, provider usage, explicit duration | 원본 기록에서 읽음 |
| 파생값 | request group, score, failure cluster | 관측값을 결정론적으로 집계 |
| 근사값 | provider 가격표 없는 cost, timestamp 기반 latency | 화면에서 `≈` 또는 설명으로 표시 |
| 영속 resource | prompt, dataset, evaluator, annotation queue, automation | trace와 분리된 JSON resource store + CRUD API |
