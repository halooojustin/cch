import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HistorySession } from "../providers/interface.js";

export const CODEX_STATE_DB = join(homedir(), ".codex", "state_5.sqlite");
export const CODEX_SESSION_INDEX = join(homedir(), ".codex", "session_index.jsonl");

export interface CodexSqliteThreadRow {
  id: string;
  cwd?: string;
  git_branch?: string | null;
  title?: string | null;
  first_user_message?: string | null;
  updated_at?: number | string | null;
  agent_role?: string | null;
}

export interface CodexSessionIndexRow {
  id: string;
  thread_name?: string | null;
  cwd?: string | null;
  git_branch?: string | null;
  title?: string | null;
  first_user_message?: string | null;
  updated_at?: number | string | null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeCodexTimestamp(
  value: unknown,
  fallbackMtime?: number,
): { timestamp: string; mtime: number } {
  const numericValue = toFiniteNumber(value);
  if (numericValue !== null) {
    const mtime = numericValue < 1e12 ? numericValue * 1000 : numericValue;
    return { timestamp: new Date(mtime).toISOString(), mtime };
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return { timestamp: new Date(parsed).toISOString(), mtime: parsed };
    }
  }

  const mtime = fallbackMtime ?? Date.now();
  return { timestamp: new Date(mtime).toISOString(), mtime };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserMessage(value: unknown): string[] {
  const text = normalizeText(value);
  return text ? [text] : [];
}

function normalizeSqliteRow(row: Partial<CodexSqliteThreadRow>, sourcePath: string): HistorySession {
  const firstMsg = normalizeText(row.first_user_message) || normalizeText(row.title);
  const { timestamp, mtime } = normalizeCodexTimestamp(row.updated_at);
  const title = normalizeText(row.title) || undefined;

  const agentRoleValue = row.agent_role;
  const agentRole =
    typeof agentRoleValue === "string" && agentRoleValue !== "default"
      ? agentRoleValue
      : undefined;

  return {
    provider: "codex",
    sessionId: normalizeText(row.id),
    sourcePath,
    cwd: normalizeText(row.cwd),
    gitBranch: normalizeText(row.git_branch),
    timestamp,
    firstMsg,
    userMsgs: normalizeUserMessage(row.first_user_message),
    mtime,
    title,
    ...(agentRole !== undefined ? { agentRole } : {}),
  };
}

function normalizeIndexRow(row: Partial<CodexSessionIndexRow>, sourcePath: string): HistorySession {
  const threadName = normalizeText(row.thread_name);
  const firstMsg = normalizeText(row.first_user_message) || normalizeText(row.title) || threadName;
  const title = normalizeText(row.title) || threadName || undefined;
  const { timestamp, mtime } = normalizeCodexTimestamp(row.updated_at);

  return {
    provider: "codex",
    sessionId: normalizeText(row.id),
    sourcePath,
    cwd: normalizeText(row.cwd),
    gitBranch: normalizeText(row.git_branch),
    timestamp,
    firstMsg,
    userMsgs: [],
    mtime,
    title,
  };
}

export function mapCodexSqliteThreadRowToHistorySession(
  row: Partial<CodexSqliteThreadRow>,
  sourcePath: string,
): HistorySession {
  return normalizeSqliteRow(row, sourcePath);
}

export function mapCodexIndexThreadRowToHistorySession(
  row: Partial<CodexSessionIndexRow>,
  sourcePath: string,
): HistorySession {
  return normalizeIndexRow(row, sourcePath);
}

export function readCodexThreadsFromSqlite(
  dbPath: string = CODEX_STATE_DB,
  limit?: number,
  exec: typeof execFileSync = execFileSync,
  includeSubagents: boolean = false,
): CodexSqliteThreadRow[] {
  const subagentFilter = includeSubagents
    ? ""
    : "AND (agent_role IS NULL OR agent_role = 'default')";
  const sql = [
    "select",
    "id,",
    "cwd,",
    "coalesce(git_branch, '') as git_branch,",
    "title,",
    "first_user_message,",
    "updated_at,",
    "agent_role",
    "from threads",
    `where archived = 0 ${subagentFilter}`,
    "order by updated_at desc, id desc",
    typeof limit === "number" ? `limit ${Math.max(0, Math.trunc(limit))}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const raw = exec("sqlite3", ["-readonly", "-json", dbPath, sql], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const parsed = JSON.parse(String(raw).trim() || "[]");
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected Codex sqlite output");
  }

  return parsed as CodexSqliteThreadRow[];
}

export function readCodexThreadsFromIndex(indexPath: string = CODEX_SESSION_INDEX): CodexSessionIndexRow[] {
  try {
    const raw = readFileSync(indexPath, "utf-8");
    const indexMtime = statSync(indexPath).mtimeMs;
    const rows: CodexSessionIndexRow[] = [];

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      const id = normalizeText(record.id);
      if (!id) continue;

      rows.push({
        id,
        thread_name: normalizeText(record.thread_name) || undefined,
        cwd: normalizeText(record.cwd) || undefined,
        git_branch: normalizeText(record.git_branch) || undefined,
        title: normalizeText(record.title) || undefined,
        first_user_message: normalizeText(record.first_user_message) || undefined,
        updated_at:
          typeof record.updated_at === "string" || typeof record.updated_at === "number"
            ? record.updated_at
            : indexMtime,
      });
    }

    rows.sort((a, b) => {
      const left = normalizeCodexTimestamp(a.updated_at).mtime;
      const right = normalizeCodexTimestamp(b.updated_at).mtime;
      return right - left;
    });
    return rows;
  } catch {
    return [];
  }
}
