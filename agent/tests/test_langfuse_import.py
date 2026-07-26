from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from kibitz_ingest.langfuse import import_file


class LangfuseImportTests(unittest.TestCase):
    def test_imports_observations_v2_jsonl(self) -> None:
        rows = [
            {
                "id": "obs-1",
                "trace_id": "trace-1",
                "project_id": "project-1",
                "trace_name": "research-agent",
                "session_id": "session-1",
                "user_id": "user-1",
                "type": "SPAN",
                "name": "search",
                "start_time": "2026-07-27 00:00:00.000000",
                "end_time": "2026-07-27 00:00:01.000000",
                "input": '{"query":"agent tracing"}',
                "output": "three results",
                "usage_details": {"input": 12, "output": 5},
            },
            {
                "id": "obs-2",
                "trace_id": "trace-1",
                "parent_observation_id": "obs-1",
                "project_id": "project-1",
                "trace_name": "research-agent",
                "type": "SPAN",
                "name": "summarize",
                "start_time": "2026-07-27 00:00:01.000000",
                "end_time": "2026-07-27 00:00:02.000000",
                "input": '{"path":"README.md"}',
                "output": "done",
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "observations.jsonl"
            path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            runs = import_file(path)

        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["id"], "lf_trace-1")
        self.assertEqual(runs[0]["project"], "project-1")
        self.assertEqual(runs[0]["sessionId"], "session-1")
        self.assertTrue(any("search" in turn.get("call", "") for turn in runs[0]["turns"]))
        self.assertEqual(runs[0]["turns"][2]["parentIndex"], 1)


if __name__ == "__main__":
    unittest.main()
