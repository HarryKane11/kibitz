import { Landing } from "../landing";

/**
 * 랜딩의 고정 주소.
 *
 * 설치본에서 `/` 는 대시보드로 보낸다. 그래도 "이 도구가 뭘 하는 건데"를 읽을 곳은
 * 있어야 하므로, 랜딩은 배포 종류와 무관하게 항상 여기에 있다. 공개 배포에서는
 * `/` 와 같은 내용이 되지만 — 링크가 죽는 것보다 중복이 낫다.
 */
export default async function WelcomePage() {
  return <Landing />;
}
