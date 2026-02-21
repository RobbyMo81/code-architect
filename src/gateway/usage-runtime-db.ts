import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

export type RuntimeUsageSnapshot = {
  sessionKey: string;
  model: string | null;
  provider: string | null;
  totalTokens: number;
  month: string;
  monthTokens: number;
  updatedAt: number;
};

function monthKeyFromDate(input: Date): string {
  return `${input.getUTCFullYear()}-${String(input.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolveDbPath(): string {
  const stateDir = resolveStateDir(process.env);
  const dir = path.join(stateDir, "usage");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "runtime-usage.sqlite");
}

function openDb() {
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(resolveDbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_usage (
      session_key TEXT PRIMARY KEY,
      provider TEXT,
      model TEXT,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS monthly_usage (
      month TEXT NOT NULL,
      session_key TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (month, session_key)
    );
    CREATE INDEX IF NOT EXISTS idx_monthly_usage_month ON monthly_usage(month);
  `);
  return db;
}

export function upsertRuntimeUsage(params: {
  sessionKey: string;
  provider?: string | null;
  model?: string | null;
  totalTokens: number;
  nowMs?: number;
}): RuntimeUsageSnapshot {
  const nowMs = params.nowMs ?? Date.now();
  const month = monthKeyFromDate(new Date(nowMs));
  const db = openDb();
  try {
    db.prepare(
      `INSERT INTO session_usage (session_key, provider, model, total_tokens, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_key) DO UPDATE SET
         provider = excluded.provider,
         model = excluded.model,
         total_tokens = excluded.total_tokens,
         updated_at = excluded.updated_at`,
    ).run(params.sessionKey, params.provider ?? null, params.model ?? null, params.totalTokens, nowMs);

    db.prepare(
      `INSERT INTO monthly_usage (month, session_key, provider, model, total_tokens, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(month, session_key) DO UPDATE SET
         provider = excluded.provider,
         model = excluded.model,
         total_tokens = excluded.total_tokens,
         updated_at = excluded.updated_at`,
    ).run(month, params.sessionKey, params.provider ?? null, params.model ?? null, params.totalTokens, nowMs);

    const row = db
      .prepare(`SELECT COALESCE(SUM(total_tokens), 0) AS month_tokens FROM monthly_usage WHERE month = ?`)
      .get(month) as { month_tokens?: number } | undefined;

    return {
      sessionKey: params.sessionKey,
      provider: params.provider ?? null,
      model: params.model ?? null,
      totalTokens: params.totalTokens,
      month,
      monthTokens: Number(row?.month_tokens ?? 0),
      updatedAt: nowMs,
    };
  } finally {
    db.close();
  }
}
