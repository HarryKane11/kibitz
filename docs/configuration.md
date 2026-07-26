# 설정

전부 환경변수입니다. **하나도 없어도 동작합니다** — 수집·탐지·트리·스킬 제안은
키를 쓰지 않습니다.

## 배포 종류

같은 코드베이스가 두 곳에 뜹니다. 다른 점은 `/` 가 무엇인지, 그리고 익명 방문자에게
무엇을 열어 두는지입니다.

| | 설치본 (기본) | 공개 사이트 (`KIBITZ_PUBLIC_SITE=1`) |
|---|---|---|
| `/` | **대시보드** | 랜딩 |
| 랜딩 | `/welcome` | `/` 와 `/welcome` |
| 붙여 넣은 API 키 | 받습니다 (그 요청에만) | **거부** |
| 토큰 없는 `POST /api/traces` | 허용 | **거부** |
| 서버의 Claude Code·Codex 로그인 | `KIBITZ_ALLOW_LOCAL_CODE_AGENTS` 에 따름 | **항상 off** |

기본값이 설치본인 이유: 설치본의 환경변수는 우리가 손댈 수 없고, 공개 배포는 우리가
하나 켜면 됩니다. 기본값은 손댈 수 없는 쪽에 맞춥니다.

`docker compose up` 을 한 사람은 자기 에이전트가 무엇을 했는지 보러 온 것입니다.
그 자리에 제품 소개를 놓으면, 자기가 설치한 도구에게 광고를 받는 셈이 됩니다.

공개 사이트에서 잠그는 셋은 전부 같은 이유입니다 — 그 URL 은 익명이고, 방문자가
자기 키를 남의 페이지에 붙여 넣게 만들면 안 되고, 우리 예산과 데모 데이터가 아무나
쓸 수 있는 것이 되어서는 안 됩니다. 서버 env 에 키를 둔 경우는 별개입니다: 그건
배포자가 자기 예산으로 한 선택이고 브라우저는 그 키를 보지 않습니다.

## 웹

| 변수 | 기본 | 설명 |
|---|---|---|
| `KIBITZ_PORT` | `3000` | compose 가 호스트에 노출할 포트 |
| `KIBITZ_PUBLIC_SITE` | `0` | `1`이면 공개 마케팅 배포 — 아래 [배포 종류](#배포-종류) |
| `KIBITZ_DATA_DIR` | `<cwd>/.kibitz/traces` | SDK 트레이스 저장소 |
| `KIBITZ_INGEST_TOKEN` | (없음) | 설정하면 `POST /api/traces` 에 `Bearer` 요구 |
| `KIBITZ_READ_TOKEN` | (없음) | 설정하면 읽기 API에 `Bearer` 요구 |
| `KIBITZ_RESOURCE_DIR` | trace 디렉터리 옆 `resources` | prompt·dataset·queue 등 영속 resource |
| `KIBITZ_PROJECT_TOKENS` | (없음) | token → project·role JSON map |
| `KIBITZ_ALLOW_LOCAL_CODE_AGENTS` | 개발 `on`, production `off` | `1`이면 Claude Code·Codex 로그인/분석 위임 |
| `KIBITZ_CLAUDE_BIN` | `claude` | Claude Code 실행 파일 경로 override |
| `KIBITZ_CODEX_BIN` | `codex` | Codex 실행 파일 경로 override |

## SDK

| 변수 | 기본 | 설명 |
|---|---|---|
| `KIBITZ_URL` | (없음) | 있으면 HTTP 전송, 없으면 파일 |
| `KIBITZ_DATA_DIR` | `.kibitz/traces` | 파일 모드 위치 |
| `KIBITZ_INGEST_TOKEN` | (없음) | 서버가 요구할 때 |

## BYOK 분석 제공자 (선택)

| 변수 | 용도 | 기본 모델 |
|---|---|---|
| Claude Code 로그인 | 설치된 `claude` CLI 계정 | CLI가 고른 모델 |
| Codex 로그인 | 설치된 `codex` CLI 계정 | CLI가 고른 모델 |
| `ANTHROPIC_API_KEY` | Claude | `claude-opus-5` |
| `OPENAI_API_KEY` | GPT | `gpt-5.4` |
| `GOOGLE_API_KEY` | Gemini | `gemini-3.1-pro-preview` |
| `OPENROUTER_API_KEY` | OpenRouter 경유 다수 | `anthropic/claude-opus-5` |
| `OLLAMA_BASE_URL` | 로컬 모델 (키 불필요) | 내려받힌 것 중 첫 번째 |

기본 모델은 제안이고 화면에서 고칠 수 있습니다. 하나도 없어도 됩니다 — 없으면 트레이스
화면의 개선 제안 패널에서 키를 붙여 넣을 수 있고, 그 키는 그 요청에만 쓰입니다.
서버에 두면 브라우저가 키를 보지 않습니다. 상세: [analysis.md](./analysis.md)

CLI 계정 방식은 키를 환경변수로 옮기지 않습니다. Kibitz 서버와 **같은 OS 사용자**가
로그인한 CLI를 실행하고, status/분석/login 명령만 위임합니다. production에서는
`KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1`을 명시해야 켜집니다.

## 데이터는 어디에 있나

| 경로 | 내용 | 커밋 |
|---|---|---|
| `web/lib/mock/traces.json` | 인제스터 결과 | **안 함** (gitignore) |
| `web/lib/mock/traces.sample.json` | 빈 배열 | 함 |
| `web/.kibitz/traces/*.json` | SDK 트레이스 | **안 함** (gitignore) |
| `web/.kibitz/resources/*.json` | prompt·dataset·evaluator·queue·automation | **안 함** |

`traces.json` 이 없으면 `pnpm dev`/`pnpm build` 가 샘플을 복사합니다. 새로 클론한
사람도 바로 뜁니다.
