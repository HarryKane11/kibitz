"""이벤트 → 트레이스. 어댑터가 무엇이든 여기서부터는 같은 코드를 지난다."""

from __future__ import annotations

from datetime import datetime

from kibitz_ingest.core import (
    DELEGATE_TOOLS,
    IDENTIFYING_ARGS,
    EMPTY_MARKERS,
    EXEC_TOOLS,
    READ_TOOLS,
    STEP_LATENCY_CAP_MS,
    WRITE_TOOLS,
    ATTACHMENT_RE,
    INTERRUPT_RE,
    canonical,
    cost,
    ctx,
    detect,
    first_line,
    obs_type,
    sha,
    short_args,
    split_title,
    title_of,
)
from kibitz_ingest.event import Event

def build_run(
    events: list[Event],
    *,
    run_id: str,
    agent: str,
    project: str,
    source: str,
    max_turns: int,
) -> dict | None:
    """이벤트 목록 → Kibitz 트레이스.

    어댑터가 형식을 읽어 `Event` 로 정규화하고, 여기서부터는 에이전트가 무엇이든
    같은 코드를 지난다. `source` 는 어느 에이전트에서 왔는지 (claude-code / codex).
    """
    events = [e for e in events if not e.sidechain]
    if len(events) < 2:
        return None

    turns: list[dict] = []
    files: set[str] = set()
    sources: list[str] = []
    model = None
    prev_ts: datetime | None = None
    t0: datetime | None = None
    idle_ms = 0
    # 다음 관측이 요청 직후인가 — 그렇다면 그 간격은 사람의 시간이다.
    after_request = False
    # 사용자 요청 하나가 이후 에이전트 작업 전체를 지배한다. 그 경계가 곧 계층이다 —
    # 우리가 만든 구분이 아니라 기록에 있는 것이고, 160턴 런을 접을 수 있는 묶음으로 만든다.
    root: int | None = None
    observation_index_by_uuid: dict[str, int] = {}

    truncated = len(events) > max_turns
    for ev in events:
        if len(turns) >= max_turns:
            break
        model = ev.model or model
        # 기록된 소요시간이 있으면 그것이 진실이다. 없을 때만 간격에서 추론하고,
        # 그때는 사람이 자리를 비운 시간이 섞이므로 아래에서 걸러낸다.
        measured = ev.duration_ms is not None
        dur = ev.duration_ms if measured else 0
        if not measured and ev.ts and prev_ts:
            dur = max(0, int((ev.ts - prev_ts).total_seconds() * 1000))
        prev_ts = ev.ts or prev_ts
        if t0 is None:
            t0 = ev.ts
        offset = int((ev.ts - t0).total_seconds() * 1000) if ev.ts and t0 else 0

        if measured:
            pass  # 실측값은 손대지 않는다
        elif after_request:
            idle_ms += dur
            dur = 0
        elif dur > STEP_LATENCY_CAP_MS:
            idle_ms += dur - STEP_LATENCY_CAP_MS
            dur = STEP_LATENCY_CAP_MS
        after_request = ev.kind in ("user", "interrupt")

        u = ev.usage or {}
        cache_read = int(u.get("cache_read_input_tokens") or 0)
        cache_write = int(u.get("cache_creation_input_tokens") or 0)
        fresh_in = int(u.get("input_tokens") or 0)
        out = int(u.get("output_tokens") or 0)
        # usage 는 assistant 메시지 단위 실측이다. 한 메시지가 여러 툴을 부를 때
        # 호출마다 복제하면 그만큼 중복 계상된다 (이 코퍼스에서는 0.1%지만 틀린 건 틀렸다).
        tokens = (cache_write + fresh_in + out) if ev.bills_usage else 0
        if not ev.bills_usage:
            cache_read = cache_write = fresh_in = out = 0

        idx = len(turns)

        if ev.kind == "attachment":
            if root is not None:
                turns[root]["attachments"] = turns[root].get("attachments", 0) + 1
            continue

        if ev.kind == "compacted":
            # 컨텍스트 압축. 에이전트가 **스스로 그랬다고 말한** 것이므로 추정이 아니다.
            #
            # 판정으로 올리지 않는다 — 창이 차면 압축은 정상 동작이고, 긴 세션마다
            # 오류를 띄우면 그 신호는 곧 무시된다. 대신 타임라인에 사건으로 남겨
            # 뒤따르는 컨텍스트 소실이 설명되게 한다.
            turns.append(
                {
                    "index": idx, "phase": "reason", "kind": "human", "verdict": "good",
                    "obsType": "event", "startOffsetMs": offset, "parentIndex": root,
                    "title": "", "titleKey": "compacted",
                    "durationMs": 0, "tokens": 0, "costUsd": 0.0,
                    "recordsKnown": len(files),
                    "context": ctx(cache_read, cache_write, fresh_in, out),
                    "output": ev.text[:400] or "context compacted",
                    "_tool": None, "_empty": False,
                    "_cacheRead": cache_read, "_cacheWrite": cache_write,
                }
            )
            continue

        if ev.kind == "interrupt":
            # 사람이 끼어든 것은 사실이다. 새 요청이 아니므로 묶음 안의 event 로 둔다.
            turns.append(
                {
                    "index": idx, "phase": "deliver", "kind": "human", "verdict": "human",
                    "obsType": "event", "startOffsetMs": offset, "parentIndex": root,
                    "title": "", "titleKey": "interrupted",
                    "durationMs": dur, "tokens": 0, "costUsd": 0.0,
                    "recordsKnown": len(files),
                    "context": ctx(cache_read, cache_write, fresh_in, out),
                    "output": ev.text[:200], "_tool": None, "_empty": False,
                    "_cacheRead": cache_read, "_cacheWrite": cache_write,
                }
            )
            continue

        if ev.kind == "user":
            sources.append(ev.text)
            turns.append(
                {
                    "index": idx, "phase": "plan", "kind": "user", "verdict": "good",
                    "obsType": "chain", "startOffsetMs": offset,
                    "title": "", "titleKey": "userRequest", "utterance": ev.text[:200],
                    "durationMs": 0, "tokens": 0, "costUsd": 0.0,
                    "recordsKnown": len(files),
                    "context": ctx(cache_read, cache_write, fresh_in, out),
                    "output": ev.text[:600], "_tool": None, "_empty": False,
                    "_cacheRead": cache_read, "_cacheWrite": cache_write,
                }
            )
            root = idx
            continue

        if ev.kind == "answer":
            sources.append(ev.text)
            turns.append(
                {
                    "index": idx, "phase": "deliver", "kind": "answer", "verdict": "good",
                    "obsType": "llm", "startOffsetMs": offset, "parentIndex": root,
                    **title_of(first_line(ev.text), "returnAnswer"),
                    "call": "respond()", "resultKey": "sent",
                    "durationMs": dur, "tokens": tokens, "costUsd": cost(tokens),
                    "recordsKnown": len(files),
                    "context": ctx(cache_read, cache_write, fresh_in, out),
                    "output": ev.text[:1200], "_tool": None, "_empty": False,
                    "_cacheRead": cache_read, "_cacheWrite": cache_write,
                }
            )
            continue

        # tool
        tool = ev.tool or "?"
        phase = (
            "gather" if tool in READ_TOOLS or tool in DELEGATE_TOOLS
            else "reason" if tool in WRITE_TOOLS or tool in EXEC_TOOLS
            else "gather"
        )
        # 확보한 정보의 단위. 파일만 세면 웹 조사 구간이 통째로 0이 되어
        # "아무것도 못 얻었다"로 잘못 읽힌다. URL·검색어도 확보한 정보다.
        target = next(
            (str(ev.args[k]) for k in IDENTIFYING_ARGS if ev.args.get(k)),
            "",
        )
        if target:
            files.add(str(target))
        sources.append(ev.result[:8000])
        empty = ev.is_error or (not ev.result.strip()) or any(
            mk.lower() in ev.result[:400].lower() for mk in EMPTY_MARKERS
        )

        turns.append(
            {
                "index": idx, "phase": phase, "kind": "decision",
                "verdict": "good",
                "obsType": obs_type(tool), "startOffsetMs": offset,
                "parentIndex": observation_index_by_uuid.get(ev.parent_uuid or "", root),
                **title_of(ev.text.strip().split("\n")[0][:120], "runTool", tool),
                "call": f"{tool}({short_args(ev.args)})",
                "callHash": sha(tool, canonical(ev.args)),
                "resultKey": "empty" if empty else "ok",
                "durationMs": dur, "tokens": tokens, "costUsd": cost(tokens),
                "recordsKnown": len(files),
                "context": ctx(cache_read, cache_write, fresh_in, out),
                **({"messageIds": ev.message_ids} if ev.message_ids else {}),
                "output": (ev.result or "—")[:1200],
                "_tool": tool, "_empty": empty, "_target": str(target),
                "_cacheRead": cache_read, "_cacheWrite": cache_write,
            }
        )
        observation_index_by_uuid[ev.uuid] = idx

    if len(turns) < 2:
        return None

    answer = next((t["output"] for t in reversed(turns) if t["kind"] == "answer"), "")
    detect(turns, answer, sources)

    for t in turns:
        for k in ("_tool", "_empty", "_target", "_cacheRead", "_cacheWrite", "_claims"):
            t.pop(k, None)

    good = sum(1 for t in turns if t["verdict"] == "good")
    total_tokens = sum(t["tokens"] for t in turns)
    wasted = sum(t["tokens"] for t in turns if t["verdict"] in ("waste", "error"))
    phases = []
    for p in ("plan", "gather", "reason", "deliver"):
        sub = [t for t in turns if t["phase"] == p]
        ok = sum(1 for t in sub if t["verdict"] == "good")
        phases.append({"phase": p, "accuracy": round(ok / len(sub) * 100) if sub else 100})

    errors = sum(1 for t in turns if t["verdict"] == "error")
    title, tail = split_title(turns)

    return {
        "id": run_id,
        "project": project,
        "agent": agent,
        "source": source,
        "title": title,
        "titleTail": tail,
        "model": model or "unknown",
        "startedAt": (events[0].ts.isoformat() if events[0].ts else "2026-07-26T00:00:00Z"),
        "durationMs": sum(t["durationMs"] for t in turns),
        "idleMs": idle_ms,
        "truncation": (
            {"captured": len(turns), "available": len(events)}
            if truncated
            else None
        ),
        "totalTokens": total_tokens,
        "costUsd": round(sum(t["costUsd"] for t in turns), 3),
        "costEstimated": True,
        # 첫 요청은 개입이 아니다. 진짜 개입은 사람이 끼어든 것(interrupt)뿐이다.
        "humanInterventions": sum(1 for t in turns if t["kind"] == "human"),
        "status": "failed" if errors >= 3 else "degraded" if errors else "ok",
        "registeredTools": 0,
        "usedTools": len({t.get("call", "").split("(")[0] for t in turns if t.get("call")}),
        "unusedToolTokens": 0,
        "score": {
            "accuracy": round(good / len(turns) * 100),
            "errors": errors,
            "wastes": sum(1 for t in turns if t["verdict"] == "waste"),
            "wastedTokenPct": round(wasted / total_tokens * 100) if total_tokens else 0,
            "phases": phases,
        },
        "turns": turns,
    }
