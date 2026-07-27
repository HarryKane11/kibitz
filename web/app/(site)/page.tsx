import { redirect } from "next/navigation";
import { isPublicSite } from "@/lib/deploy";
import { Landing } from "./landing";

/**
 * `/` 는 배포 종류에 따라 다른 것이다.
 *
 * 설치본에서 첫 화면은 **사용량**이다. 사람이 `docker compose up` 을 한 이유는 자기
 * 에이전트가 무엇을 했는지 보려는 것이고, 그 자리에 제품 소개를 놓으면 자기가 설치한
 * 도구에게 광고를 받는 셈이 된다.
 *
 * 대시보드가 아니라 사용량인 이유: 대시보드는 정확도·실패율 같은 **판단**부터
 * 보여 주는데, 방금 설치한 사람에게는 아직 판단할 맥락이 없다. 사용량은 사실만
 * 보여 준다 — "당신의 에이전트가 이 30일 동안 토큰을 어디에 썼는가". 이건 우리를
 * 설치하기 전에는 알 수 없던 것이고, 그래서 5분 안에 값을 증명하는 유일한 화면이다.
 *
 * 랜딩은 우리가 무료로 띄우는 공개 배포에서만 `/` 를 차지한다 (`KIBITZ_PUBLIC_SITE=1`).
 * 그때는 리다이렉트가 아니라 여기서 직접 렌더한다 — 마케팅 URL 은 `/` 여야 하고,
 * 302 를 한 번 거치면 그게 아니게 된다.
 *
 * 설치본에서도 랜딩을 읽고 싶으면 `/welcome` 에 그대로 있다.
 */
export default async function RootPage() {
  if (!isPublicSite()) redirect("/usage");
  return <Landing />;
}
