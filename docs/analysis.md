# 계정/API 키 기반 분석

트레이스 화면 아래 **개선 제안** 패널. 당신이 고른 제공자와 당신의 키로,
계산된 판정을 놓고 "그래서 무엇을 바꿔야 하나"를 묻습니다.

> **탐지에는 모델을 쓰지 않습니다.** 여섯 규칙은 해시 비교·부분열 탐지·집합 차·문자열
> 대조입니다 ([detection.md](./detection.md)). 이 패널을 한 번도 쓰지 않아도 제품의
> 나머지 전부가 그대로 동작합니다. 모델에게 묻는 것은 **판정이 아니라 처방**입니다.

## 무엇이 전송되는가

트랜스크립트가 아닙니다. **이미 계산된 판정과 그 근거값**입니다.

```
# Trace cc_13be93
source=claude-code agent=54f1f2 model=claude-fable-5 status=degraded
observations=160 duration=4861.0s idle=34225.7s tokens=2235569 cost=$11.178
accuracy=98% errors=1 wastes=2 wasted_tokens=7%
phase_accuracy: plan=100% gather=94% reason=99% deliver=100%
tools: registered=0 used=14 unused_definition_tokens=0

# Verdicts (3) — computed, not judged by a model

## observation 147 · call-cycle · waste
rule: repeating subsequence of length ≥ 2 in the call sequence
call: Edit(file_path="/Users/…/src/pipeline.py")
evidence:
  - repeatedSubsequence = Edit → Read
  - startTurn = 144
would_save: turns=2 ms=8927 tokens=75011

# Repeated calls (frequency ≥ 2, no verdict implied)
  35× respond() (962060 tokens)
…
```

160개 관측 · 220만 토큰짜리 런이 **1.4KB** 로 줄어듭니다. 이유가 셋입니다:

1. **프롬프트·모델 출력 본문이 제3자에게 나가지 않습니다.** 가장 민감한 데이터입니다.
2. **싸고 빠릅니다.** 트랜스크립트 전문은 수십만 토큰, 이 브리프는 2천 토큰 미만입니다.
3. **모델이 판정을 다시 하지 않습니다.** 무엇이 문제인지는 이미 정해져 있습니다.

**보내기 전에 전문을 볼 수 있습니다** — 패널의 `보낼 내용 보기` 를 누르면 위 문자열
그대로가 나옵니다. 화면에 보이는 것이 전송되는 전부입니다.

### 도구 인자 제거

브리프에는 도구 호출이 인자와 함께 들어갑니다 (`Edit(file_path="/Users/…")`). 파일
경로에 프로젝트명·고객명이 들어 있는 경우가 많으므로, **도구 인자 제거** 를 켜면
도구 이름만 남습니다:

```
call: Edit
  35× respond (962060 tokens)
  34× Edit (190022 tokens)
```

제안의 구체성은 떨어집니다. 어느 쪽을 쓸지는 브리프를 읽고 판단하세요.

## 제공자

| 제공자 | 인증 | 기본 모델 |
|---|---|---|
| Claude Code account | 설치된 CLI 로그인 | Claude Code 기본값 |
| Codex account | 설치된 CLI 로그인 | Codex 기본값 |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5.4` |
| Google | `GOOGLE_API_KEY` | `gemini-3.1-pro-preview` |
| OpenRouter | `OPENROUTER_API_KEY` | `anthropic/claude-opus-5` |
| Ollama | 필요 없음 | 로컬에 내려받힌 것 중 첫 번째 |

기본 모델은 **제안**입니다. 모델 이름은 우리가 통제하지 않는 속도로 바뀌므로 화면에서
직접 고칠 수 있습니다.

### Claude Code·Codex 로그인 사용

Kibitz와 같은 OS 사용자로 설치·로그인한 CLI를 그대로 사용할 수 있습니다.

```bash
claude auth login --claudeai
codex login --device-auth
```

개선 제안 패널에서 `Claude Code account` 또는 `Codex account`를 고르면 로그인 상태를
CLI에 묻습니다. 로그아웃 상태라면 **로그인 시작** 버튼이 공식 CLI 로그인 프로세스를
실행하고, 브라우저 URL·device code 같은 공개 안내만 화면에 보여줍니다.

Kibitz는 `~/.claude`, `~/.codex`, keychain 또는 token 파일을 직접 읽지 않습니다.
분석할 때도 credential을 API key로 변환하지 않고 다음 일회성 명령에 브리프를 stdin으로
전달합니다.

- Claude Code: print mode, JSON schema, tool 비활성, safe mode, session persistence 비활성
- Codex: `exec --ephemeral`, JSON output schema, read-only sandbox, 빈 임시 디렉터리

CLI 분석에서는 모델 필드를 비워 두면 해당 CLI가 현재 선택한 기본 모델을 사용합니다.
특정 모델을 쓰고 싶을 때만 이름을 입력하세요.

로컬 개발에서는 사용할 수 있지만 production build는 기본 비활성입니다.

```bash
KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1 pnpm start
```

이 플래그는 서버 OS 사용자의 AI 계정 예산을 쓸 수 있는 권한이므로, 신뢰하는
로컬/단일 사용자 설치에서만 켜세요.

**키는 서버에 두는 것이 기본입니다.** `.env` 에 있으면 그 제공자는 채워진 점으로
표시되고 입력란이 아예 나오지 않습니다 — 브라우저가 키를 보지 않습니다. 서버에 없으면
붙여 넣을 수 있고, 그 키는 **그 요청 하나에만** 쓰입니다. 저장하지 않고, 로그하지
않고, localStorage 에도 넣지 않습니다.

**Ollama** 는 로컬이라 키가 없습니다. 고르면 `/api/tags` 로 실제 내려받힌 모델을
물어봅니다 — 목록을 우리가 들고 있으면 반드시 낡습니다. 떠 있지 않으면 그 사실을
그 자리에서 말합니다.

```bash
docker compose --profile ollama up -d    # 로컬 모델까지 (BYOK 없이 분석)
```

호스트에 이미 ollama 가 돌고 있으면 `OLLAMA_BASE_URL=http://host.docker.internal:11434`.

## 제안이 검증되는 방식

판정과 제안은 **같은 무게로 그리지 않습니다.** 제안 블록에는 점선 테두리와
`검증되지 않음 — 모델이 쓴 글입니다` 라벨이 붙습니다.

그리고 대조합니다. 모든 제안은 **근거로 삼은 관측 번호를 적어야** 하고, 그 번호가
실제로 판정이 붙은 관측인지 확인합니다:

```
인용 대조 · cited observation ∈ observations with a verdict
```

`unsourced-number` 규칙이 출력의 숫자 리터럴을 도구 출력과 대조하는 것과 **같은 검사**를
모델의 제안에 적용하는 것입니다. 브리프에 없는 번호를 인용하면 그 칩이 빨갛게 `999 ✕`
로 표시됩니다 — 지어낸 인용입니다. 성립하는 인용은 그 관측으로 가는 링크입니다
(`/traces/<id>/timeline?obs=147`).

Anthropic, Claude Code와 Codex CLI는 JSON schema로 스키마를 **강제**합니다.
다른 제공자는 각자의 JSON 모드까지만 켜고 모양은 프롬프트로 요구한 뒤 관대하게 파싱합니다 — 그 경우
`스키마를 요구했지만 이 제공자는 강제하지 않습니다` 가 함께 표시됩니다.

## API

화면은 서버 액션을 씁니다. 스크립트·CI 용으로는 HTTP 입구가 있습니다.

```bash
# 제공자 상태 (`probe=1` 이면 ollama 에 실제로 물어봅니다)
curl -s localhost:3000/api/analyze?probe=1

# 보낼 브리프 전문. 모델을 부르지 않으므로 무료입니다.
curl -s "localhost:3000/api/analyze?runId=cc_13be93&redact=1"

# 분석
curl -s localhost:3000/api/analyze -H 'content-type: application/json' -d '{
  "runId": "cc_13be93",
  "provider": "codex-cli"
}'
```

`KIBITZ_READ_TOKEN` 을 설정하면 이 라우트도 `Authorization: Bearer` 를 요구합니다.
화면은 서버 액션(같은 출처 POST)을 쓰기 때문에 토큰을 걸어도 그대로 동작합니다.

응답:

```json
{
  "ok": true,
  "provider": "codex-cli",
  "model": "Codex account default",
  "usage": null,
  "schemaEnforced": true,
  "citationRule": "cited observation ∈ observations with a verdict",
  "summary": "…",
  "suggestions": [
    {
      "title": "Stop re-reading a file you just edited",
      "why": "Observations 147 and 149 repeat the Edit → Read subsequence starting at 144.",
      "change": "…",
      "observations": [147, 149],
      "kinds": ["call-cycle"],
      "ungrounded": []
    }
  ],
  "brief": { "chars": 1368, "verdicts": 3, "redacted": false }
}
```

실패는 `{"ok": false}` 없이 HTTP 상태로 옵니다 — `400` 설정 문제, `404` 없는 트레이스,
`422` 분석할 것이 없거나 응답을 읽지 못함(`raw` 에 원문 앞부분), `502` 제공자 오류.

## 결과는 저장됩니다

제안은 `.kibitz/analyses/<runId>.json` 에 남습니다. 새로고침해도, 브라우저를 닫아도
그대로 있습니다 — CLI 계정 분석은 몇십 초가 걸리고, 그걸 새로고침 한 번에 잃는 것은
원칙이 아니라 버그입니다.

**처음엔 저장하지 않았습니다.** 이유는 "모델이 쓴 글이 계산된 판정과 같은 저장소에
들어가면 6개월 뒤에 둘을 구분할 사람이 없다" 였습니다. 그 걱정은 맞지만 결론이
틀렸습니다. 구분은 저장을 안 하는 방식이 아니라 **자리를 나누는 방식**으로 지킵니다:

```
.kibitz/traces/     계산된 트레이스와 판정   ← 근거
.kibitz/analyses/   모델이 쓴 제안           ← 검증되지 않은 글
```

레코드마다 `createdAt`·`provider`·`model` 이 붙고, 화면은 여전히 점선 테두리와
`검증되지 않음` 라벨을 붙이며 시각을 함께 보여 줍니다. 6개월 뒤에 봐도 언제 어느
모델이 쓴 것인지 알 수 있습니다.

트레이스당 최근 **10개**만 남습니다. 무한히 쌓이면 그것도 관리 안 되는 데이터입니다.
각 기록은 화면에서 접거나 지울 수 있습니다.
