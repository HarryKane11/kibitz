from __future__ import annotations

import unittest

from kibitz_ingest.core import detect


def turn(
    index: int,
    *,
    tool: str | None = None,
    call_hash: str | None = None,
    result_empty: bool = False,
    kind: str = "decision",
    output: str = "",
) -> dict:
    return {
        "index": index,
        "kind": kind,
        "verdict": "good",
        "durationMs": 20,
        "tokens": 10,
        "output": output,
        "_tool": tool,
        "_target": "",
        "_empty": result_empty,
        "_cacheRead": 0,
        "_cacheWrite": 0,
        **({"callHash": call_hash} if call_hash else {}),
    }


class DetectionTests(unittest.TestCase):
    def test_repeated_identical_call_is_flagged(self) -> None:
        turns = [
            turn(0, tool="search", call_hash="same"),
            turn(1, tool="search", call_hash="same"),
        ]

        detect(turns, "", [])

        self.assertEqual(turns[1]["note"]["kind"], "repeated-call")
        self.assertEqual(turns[1]["verdict"], "error")

    def test_empty_result_with_changed_arguments_is_not_flagged(self) -> None:
        turns = [
            turn(0, tool="search", call_hash="first", result_empty=True),
            turn(1, tool="search", call_hash="second"),
        ]

        detect(turns, "", [])

        self.assertNotIn("note", turns[0])

    def test_unsourced_number_attaches_to_answer(self) -> None:
        turns = [
            turn(0, kind="user"),
            turn(1, kind="answer", output="Revenue grew 47%."),
        ]

        detect(turns, "Revenue grew 47%.", ["The report contains no growth percentage."])

        self.assertEqual(turns[1]["note"]["kind"], "unsourced-number")
        self.assertEqual(turns[1]["verdict"], "error")
        self.assertEqual(turns[1]["note"]["evidence"][1]["value"], "47%")

    def test_sourced_number_is_not_flagged(self) -> None:
        turns = [
            turn(0, kind="user"),
            turn(1, kind="answer", output="Revenue grew 47%."),
        ]

        detect(turns, "Revenue grew 47%.", ["Database result: growth=47%."])

        self.assertNotIn("note", turns[1])

    def test_missing_message_id_is_flagged(self) -> None:
        turns = [
            {**turn(0, tool="model", call_hash="a"), "messageIds": ["system", "user-1"]},
            {**turn(1, tool="model", call_hash="b"), "messageIds": ["system"]},
        ]

        detect(turns, "", [])

        self.assertEqual(turns[1]["note"]["kind"], "context-eviction")
        self.assertEqual(turns[1]["note"]["evidence"][0]["value"], "user-1")


if __name__ == "__main__":
    unittest.main()
