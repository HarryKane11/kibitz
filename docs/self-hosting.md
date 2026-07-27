# 셀프호스팅

## Docker (권장)

```bash
cp .env.example .env          # 키는 전부 선택. 비워 둬도 됩니다.
docker compose up -d
```

→ http://localhost:3000 — **대시보드가 첫 화면입니다.** 트레이스를 아직 하나도 넣지
않았어도 합성 픽스처가 들어 있어 빈 화면이 아닙니다. 제품 소개(랜딩)는
[/welcome](http://localhost:3000/welcome) 에 있습니다.

로컬 모델로 분석까지 쓰려면:

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull qwen3:8b
```

트레이스 화면의 **개선 제안** 패널에서 `Ollama (local)` 를 고르면 내려받힌 모델이
목록에 뜹니다. 키도 없고 아무것도 밖으로 나가지 않습니다 — [analysis.md](./analysis.md)

호스트에 설치된 Claude Code·Codex 계정을 쓰는 방식은 Docker 기본 이미지에서는
꺼져 있습니다. CLI binary와 OS credential store가 같은 사용자 경계 안에 있어야 하므로,
가장 안전한 경로는 Docker 밖에서 `pnpm start`로 Kibitz를 실행하고 다음만 켜는 것입니다.

```bash
KIBITZ_ALLOW_LOCAL_CODE_AGENTS=1 pnpm start
```

credential 디렉터리를 컨테이너에 통째로 mount하는 방식은 권장하지 않습니다.

### 런타임 트레이스는 영속 volume에 있습니다

의도한 것입니다. 트레이스에는 프롬프트·파일 경로·프로젝트명이 그대로 들어가므로,
이미지에 구우면 그 이미지를 배포하는 순간 함께 나갑니다.

`.dockerignore`가 로컬 session snapshot을 이미지에서 제외합니다. SDK와 HTTP로
수집한 runtime trace는 기본 compose의 이름 있는 volume에 저장됩니다.

```yaml
environment:
  KIBITZ_DATA_DIR: /data/traces
  KIBITZ_RESOURCE_DIR: /data/resources
volumes:
  - kibitz-data:/data
```

호스트 디렉터리로 직접 백업하려면 compose의 volume을 다음처럼 바꿀 수 있습니다.

```yaml
volumes:
  - ./data:/data
```

컨테이너 이미지를 만든 뒤 `web/lib/mock/traces.json`을 bind mount해도 Next.js의
build-time import는 바뀌지 않습니다. production 데이터는 HTTP `/api/traces`로
수집하거나 `/data/traces`에 Run JSON 파일을 넣으세요.

네트워크에 노출하기 전에 `.env`에 `KIBITZ_INGEST_TOKEN`과 `KIBITZ_READ_TOKEN`을
설정하세요. compose가 두 값을 컨테이너에 전달합니다.

Project별 API 격리가 필요하면 JSON token map을 설정합니다.

```bash
KIBITZ_PROJECT_TOKENS='{
  "prod-writer":{"project":"agent-prod","role":"ingest"},
  "prod-reader":{"project":"agent-prod","role":"read"}
}'
```

Scoped ingest token으로 들어온 request의 `project` 값은 token의 project로 강제됩니다.
Scoped read token은 같은 project의 API 결과만 볼 수 있습니다.

## 저장소 — 왜 Postgres·ClickHouse·Redis·MinIO 가 없나

Langfuse 는 그 다섯 개를 씁니다. 수백만 건이 목표이기 때문입니다:

| 서비스 | Langfuse 에서 하는 일 | Kibitz |
|---|---|---|
| ClickHouse | trace·observation·score 분석 저장소 | SQLite 요약 인덱스 |
| PostgreSQL | 프로젝트·프롬프트·데이터셋 등 트랜잭션 데이터 | JSON 파일 |
| Redis | 수집 큐 + 캐시 | 없음 (요청 안에서 처리) |
| Worker | 큐 소비, 무거운 처리 분리 | 없음 |
| MinIO/S3 | 큰 페이로드 블롭 | 파일에 그대로 |

Kibitz 는 Phoenix 쪽 모델입니다 — **컨테이너 하나, 외부 의존성 0**. `docker compose up`
이 10초에 끝나는 게 그 대가입니다.

### 천장을 재봤습니다

합성 런(관측 27개)을 넣고 저장된 런을 읽는 경로를 측정했습니다:

| 런 수 | 파일 전체 파싱 | 파싱량 |
|---:|---:|---:|
| 100 | 10ms | 2 MB |
| 1,000 | 89ms | 22 MB |
| 5,000 | 478ms | 108 MB |
| 20,000 | 2,189ms | 430 MB |

그래서 **런 요약 인덱스**(SQLite)를 넣었습니다. 목록·집계는 파일을 열지 않습니다:

| 3,000 런 | 시간 |
|---|---:|
| `/api/live` 첫 호출 (인덱스 동기화 1회) | 497ms |
| `/api/live` 이후 (인덱스 경유) | **31ms** |
| `/api/runs` (아직 파일 경유) | 310ms |

`node:sqlite` 는 Node 에 들어 있어 **의존성이 늘지 않습니다** (이미지는 Node 24 —
22 는 `--experimental-sqlite` 가 필요합니다).

### 인덱스는 파생입니다

진실의 출처는 여전히 파일입니다. `.kibitz/index.db` 는 지워도 되고, 깨져도 되고,
스키마가 바뀌어도 됩니다 — 파일 목록과 mtime 을 비교해 다시 만듭니다. 그래서
마이그레이션이 없고, 인덱스가 틀렸을 때 데이터를 잃지 않습니다.

```bash
rm .kibitz/index.db     # 다음 요청에서 다시 만들어집니다
```

### 아직 파일 경유인 곳

`/api/runs` 와 화면 컴포넌트들은 아직 전체 런을 파싱합니다. 필터 문법(숫자 비교·OR
결합·전문 검색)을 SQL 로 옮기는 작업이 남아 있습니다. **1천 건 이하면 차이를 느끼지
못합니다.** 그 이상을 쓰신다면 이 부분이 다음 작업입니다.

수백만 건·다중 노드가 필요해지면 인덱스 자리에 Postgres 나 ClickHouse 를 끼우면
됩니다 — 원본이 파일이므로 그때도 재수집이 아니라 재색인입니다.

## 다중 replica

web container는 trace와 resource를 로컬 state로 들고 있지 않습니다. 여러 replica에
동일한 RWX `/data` volume을 mount하세요. 쓰기는 같은 디렉터리의 임시 파일을 완성한 뒤
atomic rename하므로 reader가 절반만 쓰인 JSON을 보지 않습니다. Load balancer와 volume
가용성은 배포 환경이 담당합니다.

## Docker 없이

```bash
cd web
pnpm install
pnpm build
pnpm start
```

**Node 24+ 가 필요합니다.** 런 요약 인덱스가 `node:sqlite` 를 쓰고, Node 22 에서는
그게 `--experimental-sqlite` 뒤에 있습니다. `packageManager` 가 `package.json` 에
못 박혀 있으니 corepack 이 알아서 맞는 pnpm 을 씁니다.

> **pnpm 버전을 바꾸지 마세요.** pnpm 11 은 `minimumReleaseAge` 를 기본으로 켜서
> 최근 배포된 패키지가 든 락파일을 거부합니다. 올릴 때는 의존성이 그 기간을 넘긴
> 뒤에 `pnpm install` 로 락파일을 다시 만드세요.

## 이미지 직접 빌드

```bash
docker build -t kibitz/web:local ./web
docker run -p 3000:3000 kibitz/web:local
```

3단 빌드입니다 — 의존성 / 빌드 / 런타임. 런타임 이미지에는 소스도 빌드 도구도
없고 `node` 사용자로 돕니다. 약 280MB.

## 리버스 프록시 뒤에

컨테이너는 3000 에서 듣습니다. 사용자 로그인·SSO는 프록시 층에서 붙이고, collector와
API client는 Kibitz의 project-scoped token을 사용하세요. 네트워크에 노출한다면
[security.md](./security.md) 를 먼저 읽으세요.
