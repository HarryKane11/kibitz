"""
전송.

기본은 **파일 쓰기**다 — HTTP 가 아니다. 로컬에서 혼자 쓰는 경우가 대부분이고,
그때 서버가 떠 있어야 트레이스가 남는다면 계측을 켜 두기 부담스러워진다.
파일이면 앱을 나중에 띄워도 그대로 보인다.

`KIBITZ_URL` 이 있으면 HTTP 로 보낸다. 실패해도 **에이전트를 죽이지 않는다** —
옵저버빌리티가 관측 대상을 멈추게 하면 그건 도구가 아니라 장애 원인이다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DIR = Path(".kibitz") / "traces"


class KibitzClient:
    """트레이스를 파일이나 HTTP 로 내보낸다.

    Args:
        url: 수집 엔드포인트. 없으면 `KIBITZ_URL` 환경변수, 그것도 없으면 파일로.
        data_dir: 파일 모드에서 쓸 디렉터리. 없으면 `KIBITZ_DATA_DIR`, 기본 `.kibitz/traces`.
        token: `KIBITZ_INGEST_TOKEN`. 서버가 요구할 때만 필요하다.
        timeout: 초. 짧게 둔다 — 전송이 느려서 에이전트가 기다리면 안 된다.
    """

    def __init__(
        self,
        url: str | None = None,
        *,
        data_dir: str | Path | None = None,
        token: str | None = None,
        timeout: float = 5.0,
    ) -> None:
        self.url = url or os.environ.get("KIBITZ_URL")
        self.data_dir = Path(data_dir or os.environ.get("KIBITZ_DATA_DIR") or DEFAULT_DIR)
        self.token = token or os.environ.get("KIBITZ_INGEST_TOKEN")
        self.timeout = timeout

    def send(self, trace: dict) -> bool:
        """성공하면 True. **예외를 밖으로 내보내지 않는다.**"""
        if self.url:
            return self._post(trace)
        return self._write(trace)

    def _write(self, trace: dict) -> bool:
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in str(trace["id"]))
            path = self.data_dir / f"{safe}.json"
            # 임시 파일에 쓰고 원자적으로 바꾼다 — 앱이 반쯤 쓰인 파일을 읽으면
            # 그 트레이스가 조용히 사라진다.
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(trace, ensure_ascii=False), encoding="utf-8")
            tmp.replace(path)
            return True
        except (OSError, KeyError, TypeError, ValueError) as exc:
            print(f"[kibitz] 트레이스를 저장하지 못했습니다: {exc}")
            return False

    def _post(self, trace: dict) -> bool:
        assert self.url is not None
        body = json.dumps(trace, ensure_ascii=False).encode("utf-8")
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(
            self.url.rstrip("/") + "/api/traces", data=body, headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return 200 <= resp.status < 300
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            # 보내지 못했으면 잃지 않게 파일로 떨어뜨린다.
            print(f"[kibitz] 전송 실패({exc}) — 파일로 저장합니다")
            return self._write(trace)
