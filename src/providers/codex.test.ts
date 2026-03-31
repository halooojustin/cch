import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { CODEX_STATE_DB, readCodexThreadsFromSqlite } from "../utils/codex-state.js";
import { createCodexProvider } from "./codex.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

test("sqlite reader query uses real columns and no fabricated thread_name", () => {
  let executedSql = "";

  const rows = readCodexThreadsFromSqlite(
    CODEX_STATE_DB,
    7,
    ((command: string, args: readonly string[]) => {
      assert.equal(command, "sqlite3");
      assert.deepEqual(args.slice(0, 3), ["-readonly", "-json", CODEX_STATE_DB]);
      executedSql = String(args[3]);
      return JSON.stringify([
        {
          id: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
          cwd: "/Users/wellingwong",
          git_branch: "main",
          title: "Real title",
          first_user_message: "First user message",
          updated_at: 1710742570,
        },
      ]);
    }) as never,
  );

  assert.equal(rows.length, 1);
  assert.match(executedSql, /\bfirst_user_message\b/);
  assert.doesNotMatch(executedSql, /\bthread_name\b/);
  assert.match(executedSql, /\bfrom threads\b/);
  assert.match(executedSql, /\bwhere archived = 0\b/);
});

test("sqlite provider mapping ignores fabricated thread_name and derives firstMsg from sqlite fields", () => {
  const firstUpdatedAt = Math.floor(Date.UTC(2026, 2, 18, 6, 16, 10) / 1000);
  const secondUpdatedAt = Math.floor(Date.UTC(2026, 2, 17, 6, 16, 10) / 1000);
  const provider = createCodexProvider({
    dbPath: CODEX_STATE_DB,
    readSqliteRows: () =>
      [
        {
          id: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
          cwd: "/Users/wellingwong/projects/cch",
          git_branch: "main",
          title: "SQLite title fallback",
          first_user_message: "",
          thread_name: "Fabricated sqlite fallback",
          updated_at: firstUpdatedAt,
        },
        {
          id: "019d3f0b-e946-71d0-b19b-b11dffb54800",
          cwd: "/Users/wellingwong/projects/cch",
          git_branch: "feature/task-4",
          title: "SQLite title",
          first_user_message: "Actual first user message",
          thread_name: "Fabricated sqlite fallback",
          updated_at: secondUpdatedAt,
        },
      ] as any,
    readIndexRows: () => {
      throw new Error("index fallback should not be used for sqlite rows");
    },
  });

  const sessions = provider.scanSessions();

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[0], {
    provider: "codex",
    sessionId: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
    sourcePath: CODEX_STATE_DB,
    cwd: "/Users/wellingwong/projects/cch",
    gitBranch: "main",
    timestamp: new Date(firstUpdatedAt * 1000).toISOString(),
    firstMsg: "SQLite title fallback",
    userMsgs: [],
    mtime: firstUpdatedAt * 1000,
    title: "SQLite title fallback",
  });
  assert.deepEqual(sessions[1], {
    provider: "codex",
    sessionId: "019d3f0b-e946-71d0-b19b-b11dffb54800",
    sourcePath: CODEX_STATE_DB,
    cwd: "/Users/wellingwong/projects/cch",
    gitBranch: "feature/task-4",
    timestamp: new Date(secondUpdatedAt * 1000).toISOString(),
    firstMsg: "Actual first user message",
    userMsgs: ["Actual first user message"],
    mtime: secondUpdatedAt * 1000,
    title: "SQLite title",
  });
});

test("sqlite reader SQL includes subagent filter by default", () => {
  let executedSql = "";

  readCodexThreadsFromSqlite(
    CODEX_STATE_DB,
    undefined,
    ((command: string, args: readonly string[]) => {
      executedSql = String(args[3]);
      return "[]";
    }) as never,
    false,
  );

  assert.match(executedSql, /agent_role IS NULL/);
});

test("sqlite reader SQL omits subagent filter when includeSubagents is true", () => {
  let executedSql = "";

  readCodexThreadsFromSqlite(
    CODEX_STATE_DB,
    undefined,
    ((command: string, args: readonly string[]) => {
      executedSql = String(args[3]);
      return "[]";
    }) as never,
    true,
  );

  assert.doesNotMatch(executedSql, /agent_role IS NULL/);
});

test("normalizeSqliteRow maps agent_role worker to agentRole field", () => {
  const updatedAt = Math.floor(Date.UTC(2026, 2, 18, 6, 16, 10) / 1000);
  const provider = createCodexProvider({
    dbPath: CODEX_STATE_DB,
    readSqliteRows: () =>
      [
        {
          id: "worker-thread-id",
          cwd: "/workspace",
          git_branch: "main",
          title: "Worker title",
          first_user_message: "Worker task",
          updated_at: updatedAt,
          agent_role: "worker",
        },
      ] as any,
  });

  const sessions = provider.scanSessions({ includeSubagents: true });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].agentRole, "worker");
});

test("normalizeSqliteRow does not set agentRole for NULL agent_role", () => {
  const updatedAt = Math.floor(Date.UTC(2026, 2, 18, 6, 16, 10) / 1000);
  const provider = createCodexProvider({
    dbPath: CODEX_STATE_DB,
    readSqliteRows: () =>
      [
        {
          id: "main-thread-id",
          cwd: "/workspace",
          git_branch: "main",
          title: "Main title",
          first_user_message: "Main task",
          updated_at: updatedAt,
          agent_role: null,
        },
      ] as any,
  });

  const sessions = provider.scanSessions({ includeSubagents: true });

  assert.equal(sessions.length, 1);
  assert.equal(Object.hasOwn(sessions[0], "agentRole"), false);
});

test("normalizeSqliteRow sets agentRole for default agent_role (default is a subagent role)", () => {
  const updatedAt = Math.floor(Date.UTC(2026, 2, 18, 6, 16, 10) / 1000);
  const provider = createCodexProvider({
    dbPath: CODEX_STATE_DB,
    readSqliteRows: () =>
      [
        {
          id: "default-thread-id",
          cwd: "/workspace",
          git_branch: "main",
          title: "Default title",
          first_user_message: "Default task",
          updated_at: updatedAt,
          agent_role: "default",
        },
      ] as any,
  });

  const sessions = provider.scanSessions({ includeSubagents: true });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].agentRole, "default");
});

test("falls back to session_index.jsonl and preserves available metadata", () => {
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
      cwd: "/Users/wellingwong/projects/cch",
      git_branch: "feature/task-4",
      title: "Preserved title",
      first_user_message: "Preserved first message",
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
    cwd: "/Users/wellingwong/projects/cch",
    gitBranch: "feature/task-4",
    timestamp: new Date(updatedAt).toISOString(),
    firstMsg: "Preserved first message",
    userMsgs: [],
    mtime: Date.parse(updatedAt),
    title: "Preserved title",
  });
});
