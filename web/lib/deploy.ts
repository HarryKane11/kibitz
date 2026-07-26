import "server-only";

/**
 * 이 배포가 무엇인가.
 *
 * 같은 코드베이스가 두 곳에 뜬다:
 *
 *   1. **설치본** (기본) — 사람이 `docker compose up` 한 것. 첫 화면은 대시보드다.
 *      자기 트레이스를 보러 온 것이고, 우리 제품 소개를 읽으러 온 것이 아니다.
 *   2. **공개 배포** (`KIBITZ_PUBLIC_SITE=1`) — 우리가 무료로 띄우는 마케팅 사이트.
 *      첫 화면은 랜딩이고, 방문자는 익명이며 데이터는 데모다.
 *
 * 기본값이 설치본인 이유: 설치본은 우리가 설정해 줄 수 없고, 공개 배포는 우리가
 * 환경변수 하나를 켤 수 있다. 기본값은 손댈 수 없는 쪽에 맞춘다.
 *
 * 이 플래그는 첫 화면만 바꾸는 것이 아니다. 공개 URL 에서는 방문자가 API 키를 붙여
 * 넣게 두지 않고, 수집 엔드포인트를 열어 두지 않는다 — 아래 두 함수가 그것이다.
 */
export function isPublicSite(): boolean {
  return process.env.KIBITZ_PUBLIC_SITE === "1";
}

/**
 * 브라우저가 보낸 키를 받아도 되는가.
 *
 * 공개 사이트에서는 안 된다. 낯선 웹페이지에 API 키를 붙여 넣는 습관을 우리가
 * 만들어 주면 안 되고, 그 사이트가 언젠가 털리면 그 키도 함께 털린다.
 * 서버 env 에 키를 둔 경우는 별개다 — 그건 배포자가 자기 예산으로 한 선택이다.
 */
export function acceptsPastedKeys(): boolean {
  return !isPublicSite();
}

/**
 * 토큰 없는 수집을 허용하는가.
 *
 * 설치본은 대개 localhost 라 열어 둔다 (토큰을 강제하면 첫 5분이 설정 작업이 된다).
 * 공개 배포는 누구나 POST 할 수 있으므로 토큰이 없으면 닫는다.
 */
export function allowsAnonymousIngest(): boolean {
  return !isPublicSite();
}
