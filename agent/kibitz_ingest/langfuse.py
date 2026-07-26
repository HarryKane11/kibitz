"""Langfuse observations_v2 JSON/JSONL export → Kibitz traces.

Langfuse v4의 권장 export는 trace-level context가 observation row에 포함된
`observations_v2`다. 이 importer는 UI JSON export, JSONL blob export, Observations API
응답(`{"data": [...]}`)을 같은 경로로 읽는다.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from kibitz_ingest.build import build_run
from kibitz_ingest.cli import write_runs
from kibitz_ingest.event import Event


def value(row: dict[str, Any], snake: str, camel: str | None = None) -> Any:
    if snake in row:
        return row[snake]
    return row.get(camel or snake)


def parse_time(raw: Any) -> datetime | None:
    if not raw:
        return None
    text = str(raw).replace(" ", "T")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)


def as_text(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    return json.dumps(raw, ensure_ascii=False, default=str)


def as_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {"input": raw}
        return parsed if isinstance(parsed, dict) else {"input": parsed}
    return {"input": raw} if raw is not None else {}


def rows_from(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        rows: list[dict[str, Any]] = []
        for line in text.splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            if isinstance(item, dict):
                rows.append(item)
        return rows
    if isinstance(parsed, list):
        return [row for row in parsed if isinstance(row, dict)]
    if isinstance(parsed, dict):
        data = parsed.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return [parsed]
    return []


def usage_of(row: dict[str, Any]) -> dict[str, Any]:
    details = value(row, "usage_details", "usageDetails")
    details = details if isinstance(details, dict) else {}
    input_tokens = value(row, "input_usage", "inputUsage")
    output_tokens = value(row, "output_usage", "outputUsage")
    return {
        "input_tokens": int(input_tokens or details.get("input") or details.get("input_tokens") or 0),
        "output_tokens": int(
            output_tokens or details.get("output") or details.get("output_tokens") or 0
        ),
        "cache_read_input_tokens": int(
            details.get("cache_read_input_tokens") or details.get("cacheRead") or 0
        ),
        "cache_creation_input_tokens": int(
            details.get("cache_creation_input_tokens") or details.get("cacheWrite") or 0
        ),
    }


def group_rows(rows: Iterable[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        trace_id = value(row, "trace_id", "traceId")
        if trace_id:
            grouped[str(trace_id)].append(row)
    return grouped


def build_trace(trace_id: str, rows: list[dict[str, Any]], max_turns: int) -> dict | None:
    ordered = sorted(
        rows,
        key=lambda row: parse_time(value(row, "start_time", "startTime"))
        or datetime.min.replace(tzinfo=timezone.utc),
    )
    first = ordered[0]
    trace_name = str(value(first, "trace_name", "traceName") or "Langfuse trace")
    model = str(value(first, "provided_model_name", "providedModelName") or "unknown")
    started = parse_time(value(first, "start_time", "startTime"))
    events = [Event("user", started, f"{trace_id}:request", text=trace_name, model=model)]

    for row in ordered:
        start = parse_time(value(row, "start_time", "startTime"))
        end = parse_time(value(row, "end_time", "endTime"))
        duration_ms = int((end - start).total_seconds() * 1000) if start and end else None
        level = str(value(row, "level") or "").upper()
        status = as_text(value(row, "status_message", "statusMessage"))
        events.append(
            Event(
                "tool",
                start,
                str(value(row, "id") or ""),
                parent_uuid=(
                    str(parent_id)
                    if (parent_id := value(
                        row, "parent_observation_id", "parentObservationId"
                    ))
                    else None
                ),
                tool=str(value(row, "name") or value(row, "type") or "observation"),
                args=as_args(value(row, "input")),
                result=as_text(value(row, "output")),
                is_error=level in {"ERROR", "FATAL"} or bool(status),
                usage=usage_of(row),
                model=str(value(row, "provided_model_name", "providedModelName") or model),
                duration_ms=duration_ms,
            )
        )

    final_output = as_text(value(ordered[-1], "output"))
    if final_output:
        events.append(
            Event(
                "answer",
                parse_time(value(ordered[-1], "end_time", "endTime")),
                f"{trace_id}:answer",
                text=final_output,
                model=model,
                duration_ms=0,
            )
        )

    run = build_run(
        events,
        run_id=f"lf_{trace_id}",
        agent=trace_name,
        project=str(value(first, "project_id", "projectId") or "langfuse"),
        source="langfuse",
        max_turns=max_turns,
    )
    if run is None:
        return None
    for source, camel, target in (
        ("session_id", "sessionId", "sessionId"),
        ("user_id", "userId", "userId"),
        ("release", "release", "release"),
        ("environment", "environment", "environment"),
    ):
        raw = value(first, source, camel)
        if raw is not None:
            run[target] = raw
    tags = value(first, "tags")
    if isinstance(tags, list):
        run["tags"] = [str(tag) for tag in tags]
    return run


def import_file(path: Path, max_turns: int = 2000) -> list[dict]:
    return [
        run
        for trace_id, rows in group_rows(rows_from(path)).items()
        if (run := build_trace(trace_id, rows, max_turns)) is not None
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description="Langfuse observations_v2 JSON/JSONL → Kibitz")
    ap.add_argument("input", help="Langfuse JSON 또는 JSONL export")
    ap.add_argument("--out", default="../web/lib/mock/traces.json")
    ap.add_argument("--max-turns", type=int, default=2000)
    ap.add_argument("--replace", action="store_true")
    args = ap.parse_args()

    runs = import_file(Path(args.input), args.max_turns)
    write_runs(Path(args.out), runs, replace=args.replace)
    print(f"Langfuse trace {len(runs)}개를 가져왔습니다.")


if __name__ == "__main__":
    main()
