from __future__ import annotations

import asyncio
import unittest

from kibitz_sdk import tool, trace


class Sink:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def send(self, payload: dict) -> bool:
        self.payloads.append(payload)
        return True


@tool
async def async_lookup(value: str) -> str:
    await asyncio.sleep(0)
    return value


class SdkConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_tasks_keep_separate_trace_contexts(self) -> None:
        sink = Sink()

        async def worker(name: str) -> None:
            with trace(name, agent=name, client=sink) as run:
                with run.request(name):
                    await async_lookup(name)
                    await async_lookup(name)
                    run.answer(name)

        await asyncio.gather(worker("alpha"), worker("beta"))

        self.assertEqual({p["agent"] for p in sink.payloads}, {"alpha", "beta"})
        for payload in sink.payloads:
            calls = [
                turn["call"]
                for turn in payload["turns"]
                if turn.get("kind") == "decision" and turn.get("call")
            ]
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(payload["agent"] in call for call in calls))


if __name__ == "__main__":
    unittest.main()
