import "server-only";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, INDEX_DB } from "@/lib/paths";
import type { Run } from "@/lib/types";

/**
 * `node:sqlite` 를 **import 하지 않고** 가져온다.
 *
 * `import { DatabaseSync } from "node:sqlite"` 를 쓰면 Turbopack 이 이걸 외부 모듈로
 * 처리하려다 실패한다:
 *
 *   Failed to load external module node:sqlite: ReferenceError: require is not defined
 *
 * production 빌드는 통과하는데 dev 서버가 죽는다 — 그래서 처음엔 못 봤다.
 * `process.getBuiltinModule` 은 번들러가 보지 못하는 경로로 빌트인을 꺼내므로
 * 두 환경에서 모두 된다 (Node 22.3+).
 *
 * 타입은 정적 import 로만 얻고, 값은 런타임에 꺼낸다.
 */
type SqliteModule = typeof import("node:sqlite");
type Db = InstanceType<SqliteModule["DatabaseSync"]>;

function sqlite(): SqliteModule | null {
  const get = (process as NodeJS.Process & {
    getBuiltinModule?: (id: string) => unknown;
  }).getBuiltinModule;
  if (typeof get !== "function") return null;
  try {
    return get("node:sqlite") as SqliteModule;
  } catch {
    return null;
  }
}

/**
 * 런 인덱스 — 파일을 다 읽지 않고 목록·집계에 답한다.
 *
 * **왜 필요했나.** 저장된 런을 읽는 경로가 디렉터리 전체를 동기로 파싱했고, 그게
 * 페이지 렌더마다 일어났다. 재봤다 (런당 관측 27개):
 *
 *   |  런 수 | 로드    | 파싱량 |
 *   |-------:|--------:|-------:|
 *   |    100 |   10ms  |   2 MB |
 *   |  1,000 |   89ms  |  22 MB |
 *   |  5,000 |  478ms  | 108 MB |
 *   | 20,000 | 2,189ms | 430 MB |
 *
 * 목록 화면은 관측 본문이 필요 없는데도 전부 파싱하고 있었다. 요약 열만 SQLite 에
 * 넣으면 그 질의가 파일을 아예 건드리지 않는다.
 *
 * **진실의 출처는 여전히 파일이다.** 이 DB 는 파생 인덱스다 — 지워도, 깨져도,
 * 스키마가 바뀌어도 파일에서 다시 만든다(`syncFromFiles`). 그래서 마이그레이션이
 * 필요 없고, 인덱스가 틀렸을 때 데이터를 잃지 않는다. Langfuse 처럼 ClickHouse 가
 * 원본을 들고 있으면 그쪽이 깨질 때 복구가 곧 재수집이 된다.
 *
 * 의존성은 늘지 않는다 — `node:sqlite` 는 Node 에 들어 있다 (Node 24+ 는 플래그 없이).
 */

export interface RunRow {
  id: string;
  project: string;
  agent: string;
  source: string;
  model: string;
  title: string;
  startedAt: string;
  status: string;
  accuracy: number;
  errors: number;
  wastes: number;
  wastedTokenPct: number;
  durationMs: number;
  idleMs: number;
  totalTokens: number;
  costUsd: number;
  observations: number;
  sessionId: string | null;
  userId: string | null;
  tags: string;
  open: number;
  updatedAt: string;
  spanCount: number;
}

let handle: Db | null = null;
/** 한 번 실패하면 매 요청마다 다시 시도하지 않는다 — 로그가 그것만으로 가득 찬다. */
let unavailable = false;

function db(): Db {
  if (handle) return handle;
  if (unavailable) throw new Error("node:sqlite unavailable");
  const mod = sqlite();
  if (!mod) {
    unavailable = true;
    console.warn(
      "[kibitz] node:sqlite 를 쓸 수 없습니다 (Node 24+ 필요). 런 인덱스 없이 파일 경로로 돕니다.",
    );
    throw new Error("node:sqlite unavailable");
  }
  mkdirSync(/* turbopackIgnore: true */ DATA_DIR, { recursive: true });
  const next = new mod.DatabaseSync(INDEX_DB);
  // WAL: 수집이 쓰는 동안 화면이 읽을 수 있다. 없으면 배치가 들어올 때마다
  // 페이지 렌더가 잠금을 기다린다.
  next.exec("PRAGMA journal_mode = WAL");
  next.exec("PRAGMA busy_timeout = 3000");
  next.exec("PRAGMA synchronous = NORMAL");
  next.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      agent TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      title TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      status TEXT NOT NULL,
      accuracy INTEGER NOT NULL,
      errors INTEGER NOT NULL,
      wastes INTEGER NOT NULL,
      wastedTokenPct INTEGER NOT NULL,
      durationMs INTEGER NOT NULL,
      idleMs INTEGER NOT NULL,
      totalTokens INTEGER NOT NULL,
      costUsd REAL NOT NULL,
      observations INTEGER NOT NULL,
      sessionId TEXT,
      userId TEXT,
      tags TEXT NOT NULL,
      open INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      spanCount INTEGER NOT NULL,
      mtimeMs INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_started ON runs (startedAt DESC);
    CREATE INDEX IF NOT EXISTS runs_project ON runs (project, startedAt DESC);
    CREATE INDEX IF NOT EXISTS runs_status ON runs (status, startedAt DESC);
    CREATE INDEX IF NOT EXISTS runs_open ON runs (open) WHERE open = 1;
    CREATE INDEX IF NOT EXISTS runs_agent ON runs (agent);
    CREATE INDEX IF NOT EXISTS runs_model ON runs (model);
    CREATE INDEX IF NOT EXISTS runs_session ON runs (sessionId);
    CREATE INDEX IF NOT EXISTS runs_user ON runs (userId);
  `);
  handle = next;
  return next;
}

function rowFrom(run: Run, mtimeMs: number): unknown[] {
  return [
    run.id,
    run.project,
    run.agent,
    run.source ?? "unknown",
    run.model,
    run.title + (run.titleTail ?? ""),
    run.startedAt,
    run.status,
    run.score.accuracy,
    run.score.errors,
    run.score.wastes,
    run.score.wastedTokenPct,
    run.durationMs,
    run.idleMs ?? 0,
    run.totalTokens,
    run.costUsd,
    run.turns.length,
    run.sessionId ?? null,
    run.userId ?? null,
    JSON.stringify(run.tags ?? []),
    run.open ? 1 : 0,
    run.updatedAt ?? run.startedAt,
    run.spanCount ?? run.turns.length,
    mtimeMs,
  ];
}

const UPSERT = `
  INSERT INTO runs (
    id, project, agent, source, model, title, startedAt, status,
    accuracy, errors, wastes, wastedTokenPct, durationMs, idleMs,
    totalTokens, costUsd, observations, sessionId, userId, tags,
    open, updatedAt, spanCount, mtimeMs
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    project=excluded.project, agent=excluded.agent, source=excluded.source,
    model=excluded.model, title=excluded.title, startedAt=excluded.startedAt,
    status=excluded.status, accuracy=excluded.accuracy, errors=excluded.errors,
    wastes=excluded.wastes, wastedTokenPct=excluded.wastedTokenPct,
    durationMs=excluded.durationMs, idleMs=excluded.idleMs,
    totalTokens=excluded.totalTokens, costUsd=excluded.costUsd,
    observations=excluded.observations, sessionId=excluded.sessionId,
    userId=excluded.userId, tags=excluded.tags, open=excluded.open,
    updatedAt=excluded.updatedAt, spanCount=excluded.spanCount,
    mtimeMs=excluded.mtimeMs
`;

/**
 * 인덱스에 반영한다. **실패해도 던지지 않는다** — 인덱스는 파생이고,
 * 그것 때문에 수집이 실패하면 원본까지 잃는다.
 */
export function indexRun(run: Run, mtimeMs = Date.now()): void {
  try {
    db().prepare(UPSERT).run(...(rowFrom(run, mtimeMs) as never[]));
  } catch (err) {
    console.warn(`[kibitz] 인덱스 갱신 실패 (${run.id}):`, err);
  }
}

export function forgetRun(id: string): void {
  try {
    db().prepare("DELETE FROM runs WHERE id = ?").run(id);
  } catch {
    // 인덱스에 없으면 지울 것도 없다
  }
}

export interface SummaryQuery {
  project?: string;
  status?: string;
  agent?: string;
  model?: string;
  sessionId?: string;
  userId?: string;
  openOnly?: boolean;
  since?: string;
  limit?: number;
  offset?: number;
}

/** 목록·필터가 쓰는 질의. 파일을 건드리지 않는다. */
export function summaries(q: SummaryQuery = {}): RunRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  const eq = (col: string, v: string | undefined) => {
    if (!v) return;
    where.push(`${col} = ?`);
    args.push(v);
  };
  eq("project", q.project);
  eq("status", q.status);
  eq("agent", q.agent);
  eq("model", q.model);
  eq("sessionId", q.sessionId);
  eq("userId", q.userId);
  if (q.openOnly) where.push("open = 1");
  if (q.since) {
    where.push("startedAt >= ?");
    args.push(q.since);
  }
  const sql =
    `SELECT * FROM runs${where.length ? ` WHERE ${where.join(" AND ")}` : ""}` +
    ` ORDER BY startedAt DESC LIMIT ? OFFSET ?`;
  args.push(Math.min(q.limit ?? 200, 5000), q.offset ?? 0);
  try {
    return db().prepare(sql).all(...(args as never[])) as unknown as RunRow[];
  } catch (err) {
    console.warn("[kibitz] 인덱스 조회 실패:", err);
    return [];
  }
}

/** 대시보드용 집계. 20,000 건에서도 파일을 한 개도 열지 않는다. */
export function aggregates(since?: string): {
  runs: number;
  open: number;
  errorRuns: number;
  totalCostUsd: number;
  totalTokens: number;
  avgAccuracy: number;
} {
  try {
    const row = db()
      .prepare(
        `SELECT
           COUNT(*) AS runs,
           SUM(open) AS open,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errorRuns,
           COALESCE(SUM(costUsd), 0) AS totalCostUsd,
           COALESCE(SUM(totalTokens), 0) AS totalTokens,
           COALESCE(AVG(accuracy), 100) AS avgAccuracy
         FROM runs${since ? " WHERE startedAt >= ?" : ""}`,
      )
      .get(...((since ? [since] : []) as never[])) as Record<string, number> | undefined;
    return {
      runs: Number(row?.runs ?? 0),
      open: Number(row?.open ?? 0),
      errorRuns: Number(row?.errorRuns ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      avgAccuracy: Math.round(Number(row?.avgAccuracy ?? 100)),
    };
  } catch {
    return { runs: 0, open: 0, errorRuns: 0, totalCostUsd: 0, totalTokens: 0, avgAccuracy: 100 };
  }
}

export function indexedCount(): number {
  try {
    const row = db().prepare("SELECT COUNT(*) AS n FROM runs").get() as { n: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

/**
 * 파일과 인덱스를 맞춘다.
 *
 * 인덱스는 파생이므로 언제든 틀릴 수 있다 — DB 파일을 지웠거나, 다른 프로세스가
 * 트레이스를 넣었거나, 스키마를 바꿨거나. 파일 목록과 mtime 을 비교해 바뀐 것만
 * 다시 넣는다. 전부 다시 파싱하지 않으므로 재시작이 느려지지 않는다.
 *
 * `load` 는 파일 하나를 Run 으로 읽는 함수 — 순환 import 를 피하려고 주입받는다.
 */
export function syncFromFiles(load: (id: string) => Run | null): { added: number; removed: number } {
  if (!existsSync(DATA_DIR)) return { added: 0, removed: 0 };
  let added = 0;
  let removed = 0;
  try {
    // 트랜잭션 하나로 묶는다. 안 묶으면 insert 마다 fsync 가 붙어 3,000건 동기화가
    // 몇 배 느려지고, WAL 이 그만큼 커진다.
    db().exec("BEGIN");
    const known = new Map(
      (db().prepare("SELECT id, mtimeMs FROM runs").all() as unknown as {
        id: string;
        mtimeMs: number;
      }[]).map((r) => [r.id, r.mtimeMs]),
    );
    const seen = new Set<string>();

    for (const name of readdirSync(DATA_DIR)) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      const id = name.slice(0, -5);
      seen.add(id);
      const mtime = Math.round(statSync(join(/* turbopackIgnore: true */ DATA_DIR, name)).mtimeMs);
      if (known.get(id) === mtime) continue;
      const run = load(id);
      if (!run) continue;
      indexRun(run, mtime);
      added += 1;
    }

    for (const id of known.keys()) {
      if (seen.has(id)) continue;
      forgetRun(id);
      removed += 1;
    }
    db().exec("COMMIT");
  } catch (err) {
    try {
      db().exec("ROLLBACK");
    } catch {
      // 트랜잭션이 열려 있지 않았으면 롤백할 것도 없다
    }
    console.warn("[kibitz] 인덱스 동기화 실패:", err);
  }
  try {
    // WAL 을 잘라 준다. 대량 동기화 뒤 4MB 짜리 -wal 이 남아 있으면
    // 빈 인덱스인데도 디스크에 몇 MB 가 보이고, 그건 셀프호스팅하는 사람에게
    // 설명할 수 없는 것이 된다.
    db().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // 체크포인트는 최선 노력이다
  }
  return { added, removed };
}
