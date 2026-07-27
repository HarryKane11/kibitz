# 공개 사이트 배포

이 문서는 **공개 데모 사이트**(`KIBITZ_PUBLIC_SITE=1`)를 띄우는 방법입니다. 자기
트레이스를 보려고 설치하는 경우는 [self-hosting.md](./self-hosting.md)를 보세요.

## 무엇이 달라지는가

같은 코드베이스가 두 곳에 뜹니다. 차이는 환경변수 하나입니다 — `lib/deploy.ts`.

| | 설치본 (기본) | 공개 배포 (`KIBITZ_PUBLIC_SITE=1`) |
|---|---|---|
| `/` | 대시보드로 리다이렉트 | 랜딩 (`/welcome`은 양쪽 다 있음) |
| 브라우저가 붙여넣은 API 키 | 받는다 | **받지 않는다** |
| 토큰 없는 `POST /api/traces` | 허용 | **차단** |

> [!WARNING]
> 공개 URL에 `KIBITZ_PUBLIC_SITE=1` 없이 배포하면 **아무나 트레이스를 POST할 수 있고**,
> 방문자에게 낯선 웹페이지에 API 키를 붙여넣는 습관을 만들어 줍니다. 기본값이 설치본인
> 이유는 설치본은 우리가 설정해 줄 수 없기 때문이지, 공개 배포가 안전해서가 아닙니다.

## Vercel

Next.js 16 + Node 24 + 요청 시점 `node:fs` 읽기라, 지금 코드가 수정 없이 뜨는 곳은
사실상 Vercel입니다.

### 프로젝트 설정

| 항목 | 값 |
|---|---|
| Root Directory | `web` |
| Framework | Next.js (자동 감지) |
| Build Command | `web/vercel.json`이 지정 — 손대지 않아도 됨 |
| Node.js Version | 24.x |

`package.json`의 `engines.node`가 `>=24`라 Vercel이 24.x를 자동 선택합니다.
(Vercel의 Node 24 지원은 2025년 11월부터입니다 — 그 전이었다면 빌드가 막혔습니다.)

### 환경변수

```
KIBITZ_PUBLIC_SITE=1
KIBITZ_DATA_DIR=/tmp/kibitz/traces
KIBITZ_RESOURCE_DIR=/tmp/kibitz/resources
```

`/tmp`인 이유: **서버리스 파일시스템은 `/tmp` 말고 전부 읽기 전용**입니다.
`lib/paths.ts`의 기본값은 `process.cwd()/.kibitz/traces`인데, 읽기는
`loadStoredRuns()`의 `existsSync` 가드 덕분에 빈 배열로 조용히 떨어지지만 **쓰기는
예외를 던집니다.** resource CRUD가 500을 내는 걸 막으려면 쓰기 가능한 경로가 필요합니다.
`/tmp`는 요청 간에 유지되지 않지만, 공개 데모에서는 유지되면 안 되는 게 맞습니다.

API 키는 **하나도 넣지 마세요.** 탐지에는 모델을 쓰지 않으므로 키 없이 전부 동작하고,
공개 배포에 키를 두면 방문자의 클릭이 우리 예산을 씁니다.

### 데모 데이터

`lib/mock/traces.json`은 gitignore되어 있습니다 (인제스터가 실제 세션을 거기 씁니다).
빌드 커맨드가 `traces.demo.json`을 그 자리에 복사하므로, 공개 사이트는 README
스크린샷과 같은 13개 런을 보여줍니다.

복사를 빼면 `scripts/ensure-traces.mjs`가 빈 배열을 깔고 `lib/data.ts`가 합성 픽스처
9건으로 폴백합니다. 그래도 화면은 비지 않습니다.

### 알아둘 것 — Hobby는 비상업 전용

Vercel Hobby는 "제작에 관여한 누구든 금전적 이익을 얻는 목적의 배포"를 금지합니다.
오픈소스 프로젝트의 랜딩 페이지는 명시적으로 허용 사례이지만, **기부 요청도 상업적
사용에 포함**됩니다. 사이트에 GitHub Sponsors 버튼이나 유료 플랜 안내를 붙이는
순간 Pro가 필요합니다.

한도는 100GB 대역폭 / 1M 함수 호출입니다. 모든 페이지가 요청 시 파일을 읽어 동적이라
페이지뷰당 함수 호출 1회로 잡으면 됩니다.

## 다른 곳에 띄우려면

| 대상 | 상태 |
|---|---|
| **Docker / VPS** | 그대로 됩니다. `docker-compose.yml` 참고 |
| **Netlify** | 됩니다. 파일시스템 제약은 Vercel과 동일 |
| **Cloudflare Workers** | **지금은 안 됩니다.** `lib/store.ts`·`lib/index-db.ts`·`lib/spans.ts`가 동기 `node:fs`와 `node:sqlite`를 씁니다. 옮기려면 그 계층을 D1/R2 어댑터로 바꿔야 합니다 |
| **정적 export** | 안 됩니다. 서버 컴포넌트가 요청 시점에 디스크를 읽습니다 |
