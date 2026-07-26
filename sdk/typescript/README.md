# @kibitz/sdk

Async-safe TypeScript instrumentation for Node.js agents. `AsyncLocalStorage` keeps concurrent
requests isolated.

```ts
import { instrument, trace } from "@kibitz/sdk";

const search = instrument("search", async (query: string) => db.search(query), {
  type: "retriever",
});

await trace("monthly-report", { agent: "reporter", sessionId: "session-42" }, async (run) => {
  await run.request("Summarize Q3 revenue", async () => {
    const rows = await search("revenue 2026 Q3");
    run.answer(summarize(rows));
  });
});
```

Set `KIBITZ_URL` and optionally `KIBITZ_INGEST_TOKEN`, or pass a `KibitzClient`.
