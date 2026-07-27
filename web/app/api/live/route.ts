import { NextResponse } from "next/server";
import { authorizeRead } from "@/lib/api";
import { storedSummaries } from "@/lib/data";
import { ingestVersion } from "@/lib/spans";

/**
 * 실시간 감시의 심장 — "새로 들어온 게 있나".
 *
 * SSE 나 웹소켓이 아니라 아주 싼 폴링 엔드포인트다. 이유:
 *
 *   - 셀프호스팅은 리버스 프록시 뒤에 있는 경우가 많고, 그중 일부는 SSE 를 버퍼링한다.
 *     그러면 "실시간"이 조용히 30초 지연으로 바뀌고 사용자는 이유를 알 수 없다.
 *   - 이 응답은 파일 mtime 만 본다. 스팬을 파싱하지 않으므로 2초마다 불러도 싸다.
 *   - 화면은 버전이 **바뀔 때만** `router.refresh()` 를 부른다. 값이 같으면 아무 일도
 *     하지 않으므로, 끝난 런만 있는 설치본에서는 사실상 부하가 없다.
 *
 * `open` 은 아직 루트 스팬이 닫히지 않은 런이다. 하나도 없으면 화면이 폴링을 멈춘다.
 */
export async function GET(req: Request) {
  const denied = authorizeRead(req);
  if (denied) return denied;

  const { version, traces } = ingestVersion();
  // 인덱스에 `open = 1` 부분 인덱스가 있으므로, 트레이스가 몇만 개여도 이 질의는
  // 열린 것만 짚는다. 2초 폴링이 싸야 실시간 감시가 실시간으로 남는다.
  const open = (await storedSummaries({ openOnly: true, limit: 50 })).map((row) => ({
    id: row.id,
    title: row.title,
    agent: row.agent,
    spans: row.spanCount,
    updatedAt: row.updatedAt,
  }));

  return NextResponse.json(
    { version, traces, open },
    // 이 응답이 캐시되면 실시간이 아니게 된다.
    { headers: { "cache-control": "no-store" } },
  );
}
