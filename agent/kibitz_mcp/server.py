"""
Kibitz MCP 서버 — 에이전트가 자기 과거 세션을 질의한다.

    claude mcp add kibitz -- uv run --project agent python -m kibitz_mcp.server

그러면 Claude Code·Codex 가 이렇게 물을 수 있다:
  "내가 지난주에 어디서 헛돌았어?"          → find_failures
  "이 반복을 스킬로 만들 만해?"              → suggest_skills
  "cc_82ec12 세션에서 무슨 일이 있었어?"     → get_run

**HTTP 클라이언트다.** 트레이스 파일을 직접 읽지 않는다:

  1. 탐지·스킬 채굴이 웹 쪽에 한 벌만 있다. 여기서 다시 구현하면 두 답이 생기고,
     그때 어느 쪽이 맞는지 아무도 모른다. (탐지 규칙을 TypeScript 로 옮기지 않은
     것과 같은 이유다.)
  2. 원격 Kibitz 에도 붙는다. 파일을 읽으면 같은 디스크에 있어야 한다.

읽기 전용이다. 에이전트가 자기 관측 기록을 고칠 수 있으면 그 기록은 근거가 아니다.

BYOK 분석(`/api/analyze`)은 **일부러 넣지 않았다.** 그건 돈을 쓰는 호출이고, 사람이
버튼을 눌러 시작해야 한다. 에이전트가 자기 판단으로 분석을 돌릴 수 있으면 루프 한 번에
제공자 청구서가 늘어난다. 게다가 여기서 얻는 판정은 이미 계산된 것이므로, 에이전트는
모델의 제안 없이도 `find_failures` 의 규칙과 근거만으로 무엇을 고칠지 알 수 있다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("kibitz")

BASE_URL = os.environ.get("KIBITZ_URL", "http://localhost:3000").rstrip("/")
READ_TOKEN = os.environ.get("KIBITZ_READ_TOKEN")
TIMEOUT = float(os.environ.get("KIBITZ_TIMEOUT", "15"))


def _get(path: str, **params: Any) -> dict:
    """Kibitz 를 부른다. 실패는 예외가 아니라 설명으로 돌려준다 —
    MCP 클라이언트에게 스택트레이스는 쓸모가 없고, 무엇을 고쳐야 하는지가 필요하다."""
    query = {k: str(v) for k, v in params.items() if v not in (None, "")}
    url = f"{BASE_URL}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)

    req = urllib.request.Request(url, method="GET")
    if READ_TOKEN:
        req.add_header("authorization", f"Bearer {READ_TOKEN}")

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return {"error": "unauthorized — KIBITZ_READ_TOKEN 을 설정하세요"}
        if exc.code == 404:
            return {"error": "not found"}
        return {"error": f"HTTP {exc.code} from {url}"}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "error": f"Kibitz 에 닿지 못했습니다 ({BASE_URL}): {exc}. "
            "앱이 떠 있는지, KIBITZ_URL 이 맞는지 확인하세요."
        }
    except json.JSONDecodeError:
        return {"error": f"{url} 이 JSON 을 돌려주지 않았습니다"}


@mcp.tool()
def list_runs(
    source: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 20,
) -> dict:
    """트레이스 목록.

    Args:
        source: `claude-code` · `codex` · `sdk` 로 좁힌다
        status: `ok` · `degraded` · `failed`
        search: 제목·id·에이전트·사용자 전문 검색
        limit: 최대 개수 (기본 20)
    """
    clauses = []
    if source:
        clauses.append(f"source~is~{source}")
    if status:
        clauses.append(f"status~is~{status}")
    return _get("/api/runs", f="|".join(clauses), q=search, limit=limit)


@mcp.tool()
def get_run(run_id: str, include_output: bool = False) -> dict:
    """트레이스 하나 — 요약, 요청 묶음, 관측 목록, 판정.

    Args:
        run_id: 트레이스 id (`list_runs` 가 돌려준 것)
        include_output: 관측의 출력 본문까지. 기본은 끔 — 본문은 컨텍스트를
            빠르게 채우고, 대개 필요한 것은 구조와 판정이다.
    """
    return _get(f"/api/runs/{urllib.parse.quote(run_id)}", full=1 if include_output else None)


@mcp.tool()
def find_failures(kind: str | None = None, source: str | None = None, limit: int = 30) -> dict:
    """모든 트레이스의 판정을, 아낄 수 있는 토큰이 큰 것부터.

    판정마다 그것을 계산해낸 규칙과 관측치가 함께 온다 — 받는 쪽이 검증할 수 있다.
    LLM 판정이 아니라 해시 비교·집합 차·문자열 대조의 결과다.

    Args:
        kind: `repeated-call` · `call-cycle` · `empty-result-loop` ·
            `context-eviction` · `cache-break` · `unsourced-number`
        source: 에이전트로 좁힌다
        limit: 최대 개수 (기본 30)
    """
    return _get("/api/failures", kind=kind, source=source, limit=limit)


@mcp.tool()
def suggest_skills() -> dict:
    """여러 세션에 걸쳐 반복하는 일 = 스킬 후보.

    한 세션 안의 반복은 판정(`repeated-call`)이고, **세션을 넘는** 반복이 스킬로
    만들 신호다. 후보마다 몇 개 세션에서 몇 번 나왔고 토큰을 얼마나 썼는지가
    붙어 있으므로, 만들 값이 있는지 직접 판단할 수 있다.
    """
    return _get("/api/skills")


@mcp.tool()
def compare_runs(run_a: str, run_b: str) -> dict:
    """두 트레이스를 나란히. 같은 작업을 다시 했을 때 나아졌는지 본다.

    Args:
        run_a: 기준
        run_b: 비교 대상
    """
    a = _get(f"/api/runs/{urllib.parse.quote(run_a)}")
    b = _get(f"/api/runs/{urllib.parse.quote(run_b)}")
    for side, run in (("run_a", a), ("run_b", b)):
        if "error" in run:
            return {"error": f"{side}: {run['error']}"}

    def digest(r: dict) -> dict:
        return {
            "id": r["id"],
            "source": r["source"],
            "accuracy": r["accuracy"],
            "errors": r["errors"],
            "wastes": r["wastes"],
            "observations": r["observations_count"]
            if "observations_count" in r
            else len(r.get("observations", [])),
            "durationMs": r["durationMs"],
            "totalTokens": r["totalTokens"],
            "costUsd": r["costUsd"],
            "verdictKinds": sorted({v["kind"] for v in r.get("verdicts", [])}),
        }

    da, db = digest(a), digest(b)
    return {
        "run_a": da,
        "run_b": db,
        "delta": {
            "accuracy": db["accuracy"] - da["accuracy"],
            "errors": db["errors"] - da["errors"],
            "observations": db["observations"] - da["observations"],
            "tokens": db["totalTokens"] - da["totalTokens"],
            "costUsd": round(db["costUsd"] - da["costUsd"], 4),
        },
        "note": "delta 는 run_b − run_a. 음수면 run_b 가 더 적게 썼다는 뜻이다.",
    }


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
