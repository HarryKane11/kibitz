# Kibitz Web

장기 실행 agent trace를 탐색하는 Next.js 애플리케이션입니다.

## 실행

```bash
pnpm install
pnpm dev
```

열기:

- `/` — 제품 랜딩
- `/docs` — 사용자 quickstart
- `/dashboard` — 조치가 필요한 trace 우선 요약
- `/traces` — trace 검색·필터
- `/traces/[runId]` — run 요약·finding
- `/traces/[runId]/timeline` — nested observation tree와 waterfall

## 데이터

런타임 HTTP/SDK trace는 `KIBITZ_DATA_DIR` 또는 기본 `.kibitz/traces`에서 요청마다
다시 읽습니다. 실데이터가 하나라도 있으면 합성 demo run은 목록에 섞이지 않습니다.

```bash
export KIBITZ_DATA_DIR="$PWD/.kibitz/traces"
pnpm dev
```

상세 수집 방법은 [`../docs/quickstart.md`](../docs/quickstart.md)를 참고하세요.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Prompt·dataset·evaluator·annotation queue·automation resource는
`KIBITZ_RESOURCE_DIR` 또는 trace 디렉터리와 나란한 `resources/`에 영속 저장되며
`/api/resources/[kind]` CRUD API로 관리할 수 있습니다.
