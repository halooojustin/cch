import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  CODEX_SESSION_INDEX,
  CODEX_STATE_DB,
  mapCodexThreadRowToHistorySession,
  readCodexThreadsFromSqlite,
} from "../utils/codex-state.js";
import { createCodexProvider } from "./codex.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

test("maps sqlite rows into normalized HistorySession objects", () => {
  const updatedAt = Math.floor(Date.UTC(2026, 2, 18, 6, 16, 10) / 1000);
  const session = mapCodexThreadRowToHistorySession(
    {
      id: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
      cwd: "/Users/wellingwong",
      git_branch: "main",
      title: "SQLite title",
      first_user_message: "",
      updated_at: updatedAt,
    },
    CODEX_STATE_DB,
  );

  assert.deepEqual(session, {
    provider: "codex",
    sessionId: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
    sourcePath: CODEX_STATE_DB,
    cwd: "/Users/wellingwong",
    gitBranch: "main",
    timestamp: new Date(updatedAt * 1000).toISOString(),
    firstMsg: "SQLite title",
    userMsgs: [],
    mtime: updatedAt * 1000,
    title: "SQLite title",
  });
});

test("falls back to session_index.jsonl when sqlite is unavailable", () => {
  const root = mkdtempSync(join(tmpdir(), "cch-codex-"));
  tempRoots.push(root);

  const indexDir = join(root, ".codex");
  mkdirSync(indexDir, { recursive: true });
  const indexPath = join(indexDir, "session_index.jsonl");
  const updatedAt = "2026-03-18T06:16:10.236488Z";
  writeFileSync(
    indexPath,
    `${JSON.stringify({
      id: "019c2ba8-059e-7c30-9e8c-192d381f0516",
      thread_name: "Fallback thread",
      updated_at: updatedAt,
    })}\n`,
  );

  const provider = createCodexProvider({
    dbPath: join(root, ".codex", "state_5.sqlite"),
    indexPath,
    readSqliteRows: () => {
      throw new Error("sqlite unavailable");
    },
  });

  const sessions = provider.scanSessions();

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    provider: "codex",
    sessionId: "019c2ba8-059e-7c30-9e8c-192d381f0516",
    sourcePath: indexPath,
    cwd: "",
    gitBranch: "",
    timestamp: new Date(updatedAt).toISOString(),
    firstMsg: "Fallback thread",
    userMsgs: [],
    mtime: Date.parse(updatedAt),
    title: "Fallback thread",
  });
});

test("sqlite query includes thread_name and the mapper falls back to it", () => {
  let capturedSql = "";
  const rows = readCodexThreadsFromSqlite(
    "/tmp/codex.sqlite",
    1,
    ((command: string, args: string[]) => {
      assert.equal(command, "sqlite3");
      capturedSql = args[3];
      return JSON.stringify([
        {
          id: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
          cwd: "/Users/wellingwong",
          git_branch: "main",
          title: "",
          first_user_message: "",
          thread_name: "Thread fallback",
          updated_at: 1773814560000,
        },
      ]);
    }) as typeof import("node:child_process").execFileSync,
  );

  assert.match(capturedSql, /title as thread_name/);
  const session = mapCodexThreadRowToHistorySession(rows[0], "/tmp/codex.sqlite");

  assert.equal(session.firstMsg, "Thread fallback");
});
