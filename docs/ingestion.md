# 세션 기록 읽기

```bash
cd agent && uv sync

uv run python -m kibitz_ingest.cli --source all --limit 8
uv run python -m kibitz_ingest.cli --source claude-code
uv run python -m kibitz_ingest.cli --source codex --limit 20
```

| 옵션 | 기본 | 설명 |
|---|---|---|
| `--source` | `all` | `claude-code` · `codex` · `all` |
| `--root` | 어댑터 기본 | 세션 디렉터리 |
| `--out` | `../web/lib/mock/traces.json` | 결과 |
| `--limit` | `8` | 소스별 세션 수 |
| `--max-turns` | `2000` | 트레이스당 관측 상한, 초과하면 trace에 절단 표시 |
| `--min-size` | `120000` | 이 크기 미만 파일은 건너뜀 |
| `--replace` | 꺼짐 | 기존 출력과 병합하지 않고 이번 결과로 교체 |
| `--watch` | 꺼짐 | eligible session의 변경을 감시해 자동 재수집 |
| `--interval` | `2` | watch polling 간격(초) |

기본 경로: Claude Code `~/.claude/projects`, Codex `~/.codex/sessions`.

조건을 통과한 파일은 **최근 수정 순**으로 선택합니다. 출력 파일이 이미 있으면 trace id로
병합하므로 이전 snapshot을 잃지 않습니다. 완전히 다시 만들 때만 `--replace`를 씁니다.
기본은 snapshot import입니다. 연속 수집은 `--watch`를 붙입니다.

```bash
uv run python -m kibitz_ingest.cli --source all --watch
```

## Langfuse observations_v2

Langfuse v4의 Observations API 응답 또는 enriched `observations_v2` JSON/JSONL export를
traceId로 다시 묶습니다.

```bash
uv run kibitz-langfuse-import observations_v2.jsonl \
  --out ../web/.kibitz/traces/langfuse.json
```

## OpenTelemetry

OTLP/HTTP JSON exporter의 base endpoint를 `https://<host>/api/otel`로 설정하세요.
표준 경로 `/v1/traces`가 붙어 `/api/otel/v1/traces`로 전송됩니다.

## 어댑터마다 기록의 풍부함이 다릅니다

| 신호 | Claude Code | Codex |
|---|---|---|
| 턴 소요시간 | 없음 → 이벤트 간격에서 추론 | `task_complete.duration_ms` 실측 |
| 호출별 소요시간 | 없음 | `Wall time:` 이 있지만 **청크 단위** — 쓰지 않음 |
| 컨텍스트 손실 | 캐시 읽기 급락으로 추정 | `context_compacted` 명시적 이벤트 |
| 캐시 토큰 | `cache_read_input_tokens` | `cached_input_tokens` |
| 동적 툴 탐색 | 없음 | `tool_search_call` |

**지연은 에이전트가 실제로 쓴 시간만 셉니다.** Claude Code 는 소요시간을 기록하지
않아 이벤트 간격으로 추론해야 하는데, 그 간격에는 사람이 자리를 비운 시간이
섞입니다. 실측 코퍼스에서 한 세션은 66시간짜리 간격을 갖고 있었습니다 — 사흘
열려 있었던 것이고, 그 런 "지연"의 99.8%가 사람의 부재였습니다.

그래서 요청 직후 첫 스텝의 간격은 통째로 대기로 넘기고, 나머지는 5분 상한을 넘는
부분만 넘깁니다. 버리지 않고 `idleMs` 로 따로 셉니다 — 사라진 시간은 나중에
아무도 설명할 수 없습니다.

## 새 에이전트 붙이기

어댑터 하나를 더 쓰면 됩니다. 규칙은 손대지 않습니다.

```python
# agent/kibitz_ingest/adapters/myagent.py
from kibitz_ingest.event import Event

SOURCE = "myagent"
DEFAULT_ROOT = Path.home() / ".myagent" / "logs"

def read_events(path: Path) -> Iterator[Event]: ...
def project_name(path: Path) -> str: ...
def discover(root: Path, min_size: int) -> list[Path]: ...
```

`cli.py` 의 `ADAPTERS` 에 등록하면 끝입니다. `Event` 를 채우면 계층·탐지·집계는
공용 코드가 처리합니다.

`Event.duration_ms` 를 채우면 실측으로 취급하고, 비워 두면 간격에서 추론하며
사람 대기를 걸러냅니다.
