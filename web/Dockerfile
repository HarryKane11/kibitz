# syntax=docker/dockerfile:1.7
#
# Kibitz 웹 이미지.
#
# 3단 빌드다. 각 단계가 왜 필요한지:
#   deps    의존성만 먼저 설치해 락파일이 안 바뀌면 캐시를 재사용한다.
#           소스와 함께 설치하면 코드 한 줄 고칠 때마다 전체 재설치가 돈다.
#   build   `output: "standalone"` 으로 실제 쓰이는 모듈만 추려 낸다.
#   runner  런타임에는 빌드 도구도, 소스도, 락파일도 필요 없다.
#
# 이미지에 **세션 데이터를 굽지 않는다.** `.dockerignore` 가 traces.json 을 막고,
# 빌드 시점에는 빈 샘플이 들어간다 — 컨테이너를 배포하면 그 안의 것이 그대로 나가므로.
# 실제 데이터는 볼륨으로 마운트한다 (docs/self-hosting.md 참고).

FROM node:22-alpine AS base
# corepack 이 package.json 의 `packageManager` 를 그대로 쓴다.
# 이걸 못 박지 않으면 컨테이너가 최신 major 를 집어 오고, 로컬과 다른 pnpm 이
# 락파일을 거부한다 — pnpm 11 은 `minimumReleaseAge` 를 기본으로 켜므로
# 방금 배포된 패키지가 든 락파일이 통째로 막힌다.
RUN corepack enable
WORKDIR /app

# ── 1. 의존성 ───────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# 락파일이 있으면 frozen 으로 — 이미지가 로컬과 다른 버전을 조용히 집는 일을 막는다.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    else echo "! pnpm-lock.yaml 없음 — 재현 가능한 빌드가 아닙니다" && pnpm install; fi

# ── 2. 빌드 ─────────────────────────────────────────────────────
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# traces.json 은 .dockerignore 로 빠져 있다. prebuild 훅이 빈 샘플을 깔아 준다.
RUN pnpm build

# ── 3. 런타임 ───────────────────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# root 로 돌리지 않는다. alpine 의 node 이미지는 uid 1000 에 `node` 를 이미 갖고 있다.
USER node

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000

# 헬스체크는 앱이 실제로 응답하는지 본다. 프로세스 생존만 보면 부팅 실패를 놓친다.
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
