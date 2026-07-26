# Kibitz 문서

에이전트가 **무엇을 결정했고 왜 그랬는지** 보는 오픈소스 옵저버빌리티.

| 문서 | 내용 |
|---|---|
| [self-hosting.md](./self-hosting.md) | Docker · compose · 로컬 실행 |
| [ingestion.md](./ingestion.md) | Claude Code · Codex 세션 읽기 |
| [sdk.md](./sdk.md) | **코드로 만든 에이전트** 계측 (Python SDK) |
| [quickstart.md](./quickstart.md) | 목적별 첫 trace 만들기 |
| [concepts.md](./concepts.md) | trace · request group · observation · finding |
| [migration-from-langfuse.md](./migration-from-langfuse.md) | 대체 범위·공존·현재 미지원 |
| [detection.md](./detection.md) | 여섯 판정 규칙이 무엇을 계산하는가 |
| [analysis.md](./analysis.md) | CLI 계정·BYOK 개선 제안 — 인증, 전송 범위, 검증 방식 |
| [configuration.md](./configuration.md) | 환경변수 전체 |
| [security.md](./security.md) | 무엇이 어디에 저장되는가, 노출 전 확인 |

## 5분 안에

```bash
git clone <repo> && cd kibitz

# 1. 앱을 띄운다 (합성 픽스처 9건이 들어 있어 빈 화면이 아니다)
cd web && pnpm install && pnpm dev     # → http://localhost:3000

# 2. 내 코드 에이전트 세션을 읽어 온다
cd ../agent && uv sync
uv run python -m kibitz_ingest.cli --source all --limit 8

# 3. 새로고침
```

## 이 도구가 다른 점

판정에 **LLM을 쓰지 않습니다.** 모델에게 "이번 런 괜찮았어?"를 물으면 그 대답이
또 하나의 검증 못 하는 것이 됩니다. 현재 여섯 규칙은 해시 비교·집합 차·문자열
대조여서, 판정마다 그것을 계산해낸 값을 함께 보여줄 수 있습니다.

그래서 **API 키가 없어도 전부 동작합니다.** 키나 CLI 계정은 선택적인 분석(개선 제안)에만
씁니다.
