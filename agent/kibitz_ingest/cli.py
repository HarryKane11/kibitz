"""
Kibitz code-agent 인제스트 CLI.

    uv run python -m kibitz_ingest.cli --source all --limit 12
    uv run python -m kibitz_ingest.cli --source codex --watch

어댑터가 형식을 읽어 `Event` 로 정규화하고, 탐지·집계는 하나의 코드를 지난다.
`--watch`는 eligible session 파일의 mtime을 감시해 변경된 snapshot을 자동 재수집한다.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

from kibitz_ingest.adapters import claude_code, codex
from kibitz_ingest.build import build_run

ADAPTERS = {claude_code.SOURCE: claude_code, codex.SOURCE: codex}
PREFIX = {claude_code.SOURCE: "cc", codex.SOURCE: "cx"}


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="코드 에이전트 세션 기록 → Kibitz 트레이스")
    ap.add_argument(
        "--source",
        default="all",
        choices=[*ADAPTERS, "all"],
        help="읽을 에이전트 (기본: all)",
    )
    ap.add_argument("--root", help="세션 디렉터리 (기본: 어댑터별 기본 경로)")
    ap.add_argument("--out", default="../web/lib/mock/traces.json")
    ap.add_argument("--limit", type=int, default=8, help="소스별 변환할 세션 수")
    ap.add_argument("--max-turns", type=int, default=2000)
    ap.add_argument("--min-size", type=int, default=120_000, help="최소 파일 크기(바이트)")
    ap.add_argument(
        "--replace",
        action="store_true",
        help="기존 출력과 병합하지 않고 이번 결과로 교체",
    )
    ap.add_argument(
        "--watch",
        action="store_true",
        help="세션 파일 변경을 감시해 자동 재수집",
    )
    ap.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="watch polling 간격(초, 기본 2)",
    )
    return ap


def candidates(
    args: argparse.Namespace, *, quiet: bool = False
) -> list[tuple[str, Any, Path]]:
    sources = list(ADAPTERS) if args.source == "all" else [args.source]
    found: list[tuple[str, Any, Path]] = []
    for source in sources:
        mod = ADAPTERS[source]
        root = Path(args.root) if args.root else mod.DEFAULT_ROOT
        if not root.exists():
            if not quiet:
                print(f"  – {source}: {root} 없음, 건너뜀")
            continue
        files = mod.discover(root, args.min_size)
        if not quiet:
            print(f"{source}: 후보 {len(files)}건 (>= {args.min_size:,}B)")
        found.extend((source, mod, path) for path in files[: args.limit])
    return found


def fingerprint(files: list[tuple[str, Any, Path]]) -> tuple[tuple[str, int, int], ...]:
    stamps: list[tuple[str, int, int]] = []
    for _, _, path in files:
        try:
            stat = path.stat()
        except OSError:
            continue
        stamps.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(stamps)


def collect(args: argparse.Namespace, files: list[tuple[str, Any, Path]]) -> list[dict]:
    runs: list[dict] = []
    kinds: Counter[str] = Counter()

    for source, mod, path in files:
        short = f"{PREFIX[source]}_{path.stem[-6:]}"
        try:
            events = list(mod.read_events(path))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! {path.name}: {exc}")
            continue

        run = build_run(
            events,
            run_id=short,
            agent=mod.project_name(path),
            project=source,
            source=source,
            max_turns=args.max_turns,
        )
        if not run:
            continue

        runs.append(run)
        for turn in run["turns"]:
            if turn.get("note"):
                kinds[turn["note"]["kind"]] += 1
        print(
            f"  ✓ {run['id']}  턴 {len(run['turns']):3}  "
            f"정확도 {run['score']['accuracy']:3}%  "
            f"오류 {run['score']['errors']}  "
            f"{run['title'][:40]}"
        )

    write_runs(Path(args.out), runs, replace=args.replace)
    print(f"탐지 결과: {dict(kinds)}")
    return runs


def write_runs(out: Path, runs: list[dict], *, replace: bool) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not replace:
        try:
            existing = json.loads(out.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = []
        if isinstance(existing, list):
            merged = {
                run["id"]: run
                for run in [*existing, *runs]
                if isinstance(run, dict) and isinstance(run.get("id"), str)
            }
            runs = list(merged.values())
    out.write_text(json.dumps(runs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(runs)}개 런 → {out}")


def main() -> None:
    args = parser().parse_args()
    files = candidates(args)
    collect(args, files)
    if not args.watch:
        return

    previous = fingerprint(files)
    print(f"\n변경 감시 중 · {max(args.interval, 0.25):g}초 간격 · Ctrl-C로 종료")
    try:
        while True:
            time.sleep(max(args.interval, 0.25))
            files = candidates(args, quiet=True)
            current = fingerprint(files)
            if current == previous:
                continue
            previous = current
            print("\n세션 변경 감지 — 재수집")
            collect(args, files)
    except KeyboardInterrupt:
        print("\n감시 종료")


if __name__ == "__main__":
    main()
