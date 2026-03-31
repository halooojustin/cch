import { strict as assert } from "node:assert";
import { appendFileSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { writeCache as writeConfigCache } from "../config/index.js";
import type { HistorySession } from "../providers/interface.js";

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "cch-history-"));
process.env.HOME = tempHome;

const historyModuleUrl = new URL(`./history.ts?smoke=${Date.now()}`, import.meta.url);
const { loadSessions, searchSessions } = await import(historyModuleUrl.href);
const { claudeProvider } = await import(new URL(`../providers/claude.ts?smoke=${Date.now()}`, import.meta.url).href);

after(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

function writeClaudeSession(
  project: string,
  relativePath: string,
  data: {
    cwd: string;
    gitBranch: string;
    timestamp: string;
    firstMsg: string;
    userMsgs?: string[];
  },
): string {
  const filePath = join(tempHome, ".claude", "projects", project, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });

  const messages = [
    {
      type: "system",
      cwd: data.cwd,
      gitBranch: data.gitBranch,
      timestamp: data.timestamp,
    },
    {
      type: "user",
      message: {
        content: [{ type: "text", text: data.firstMsg }],
      },
    },
  ];

  writeFileSync(filePath, messages.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return filePath;
}

function writeCache(cache: Record<string, unknown>): void {
  writeConfigCache(cache);
}

function writeCodexIndexSession(
  id: string,
  updatedAt: string,
  data: {
    cwd: string;
    gitBranch: string;
    title?: string;
    firstUserMessage?: string;
    threadName?: string;
  },
): string {
  const filePath = join(tempHome, ".codex", "session_index.jsonl");
  mkdirSync(join(filePath, ".."), { recursive: true });
  appendFileSync(
    filePath,
    `${JSON.stringify({
      id,
      cwd: data.cwd,
      git_branch: data.gitBranch,
      title: data.title,
      first_user_message: data.firstUserMessage,
      thread_name: data.threadName,
      updated_at: updatedAt,
    })}\n`,
  );
  return filePath;
}

function resetFixtures(): void {
  rmSync(join(tempHome, ".claude"), { recursive: true, force: true });
  rmSync(join(tempHome, ".codex"), { recursive: true, force: true });
  rmSync(join(tempHome, ".config"), { recursive: true, force: true });
  writeCache({});
}

beforeEach(() => {
  resetFixtures();
});

test("loadSessions returns normalized Claude sessions", { concurrency: false }, () => {
  const filePath = writeClaudeSession("demo-project", "session-one.jsonl", {
    cwd: "/workspace/alpha",
    gitBranch: "main",
    timestamp: "2026-03-31T10:00:00.000Z",
    firstMsg: "Hello Claude",
  });

  writeCache({});

  const sessions = loadSessions("claude");

  assert.equal(sessions.length, 1);
  assert.equal(claudeProvider.name, "claude");
  assert.deepEqual(sessions[0], {
    provider: "claude",
    sessionId: "session-one",
    sourcePath: filePath,
    cwd: "/workspace/alpha",
    gitBranch: "main",
    timestamp: "2026-03-31T10:00:00.000Z",
    firstMsg: "Hello Claude",
    userMsgs: ["Hello Claude"],
    mtime: sessions[0].mtime,
  });
  assert.equal(Object.hasOwn(sessions[0], "filePath"), false);
  assert.deepEqual(claudeProvider.buildResumeInvocation("session-one"), {
    command: "claude",
    args: ["--dangerously-skip-permissions", "--resume", "session-one"],
  });
});

test("loadSessions keeps cached Claude entries sorted by mtime", { concurrency: false }, () => {
  const olderPath = writeClaudeSession("demo-project", "older.jsonl", {
    cwd: "/workspace/older",
    gitBranch: "release",
    timestamp: "2026-03-30T10:00:00.000Z",
    firstMsg: "Older session",
  });
  const newerPath = writeClaudeSession("demo-project", "newer.jsonl", {
    cwd: "/workspace/newer",
    gitBranch: "main",
    timestamp: "2026-03-31T11:00:00.000Z",
    firstMsg: "Newer session",
  });

  utimesSync(olderPath, new Date("2026-03-30T12:00:00.000Z"), new Date("2026-03-30T12:00:00.000Z"));
  utimesSync(newerPath, new Date("2026-03-31T12:00:00.000Z"), new Date("2026-03-31T12:00:00.000Z"));

  writeFileSync(olderPath, "{not valid jsonl}\n");
  utimesSync(olderPath, new Date("2026-03-30T12:00:00.000Z"), new Date("2026-03-30T12:00:00.000Z"));
  const olderMtime = statSync(olderPath).mtimeMs;

  writeCache({
    [`claude:${olderPath}`]: {
      provider: "claude",
      mtime: olderMtime,
      sessionId: "older",
      sourcePath: olderPath,
      cwd: "/workspace/cached",
      gitBranch: "cached-branch",
      timestamp: "2026-03-30T10:00:00.000Z",
      firstMsg: "Cached older session",
      userMsgs: ["Cached older session"],
    },
  });

  const sessions: HistorySession[] = loadSessions("claude", 2);

  assert.deepEqual(
    sessions.map((session: HistorySession) => session.sourcePath),
    [newerPath, olderPath],
  );
  assert.equal(sessions[1].firstMsg, "Cached older session");
  assert.equal(sessions[1].provider, "claude");
});

test("loadSessions reparses Claude sessions when cached rows are malformed", { concurrency: false }, () => {
  const filePath = writeClaudeSession("demo-project", "reparse.jsonl", {
    cwd: "/workspace/reparse",
    gitBranch: "main",
    timestamp: "2026-03-31T09:30:00.000Z",
    firstMsg: "Fresh Claude session",
  });

  const mtime = statSync(filePath).mtimeMs;
  writeCache({
    [`claude:${filePath}`]: {
      provider: "claude",
      mtime,
      sourcePath: filePath,
      sessionId: "reparse",
    },
  });

  const sessions: HistorySession[] = loadSessions("claude");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    provider: "claude",
    sessionId: "reparse",
    sourcePath: filePath,
    cwd: "/workspace/reparse",
    gitBranch: "main",
    timestamp: "2026-03-31T09:30:00.000Z",
    firstMsg: "Fresh Claude session",
    userMsgs: ["Fresh Claude session"],
    mtime: sessions[0].mtime,
  });
});

test("loadSessions merges all providers by mtime before applying the limit", { concurrency: false }, () => {
  const claudePath = writeClaudeSession("demo-project", "claude-mid.jsonl", {
    cwd: "/workspace/claude-mid",
    gitBranch: "main",
    timestamp: "2026-03-31T11:00:00.000Z",
    firstMsg: "Claude middle session",
  });
  const codexIndexPath = writeCodexIndexSession(
    "codex-new",
    "2026-03-31T12:00:00.000Z",
    {
      cwd: "/workspace/codex-new",
      gitBranch: "feature/codex",
      title: "Codex newest session",
      firstUserMessage: "Codex newest session",
    },
  );
  writeCodexIndexSession(
    "codex-old",
    "2026-03-31T09:00:00.000Z",
    {
      cwd: "/workspace/codex-old",
      gitBranch: "feature/codex",
      title: "Codex older session",
      firstUserMessage: "Codex older session",
    },
  );

  utimesSync(claudePath, new Date("2026-03-31T11:00:00.000Z"), new Date("2026-03-31T11:00:00.000Z"));

  const sessions: HistorySession[] = loadSessions("all", 2);

  assert.deepEqual(
    sessions.map((session: HistorySession) => session.sourcePath),
    [
      codexIndexPath,
      claudePath,
    ],
  );
  assert.deepEqual(
    sessions.map((session: HistorySession) => session.provider),
    ["codex", "claude"],
  );
});

test("searchSessions respects provider selection", { concurrency: false }, () => {
  writeClaudeSession("demo-project", "claude-search.jsonl", {
    cwd: "/workspace/search-claude",
    gitBranch: "main",
    timestamp: "2026-03-31T10:00:00.000Z",
    firstMsg: "Claude codex search target",
  });
  const codexIndexPath = writeCodexIndexSession(
    "codex-search",
    "2026-03-31T12:00:00.000Z",
    {
      cwd: "/workspace/search-codex",
      gitBranch: "feature/codex",
      title: "Codex codex search target",
      firstUserMessage: "Codex codex search target",
    },
  );

  const matches: HistorySession[] = searchSessions("codex", "codex");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].provider, "codex");
  assert.equal(matches[0].sourcePath, codexIndexPath);
  assert.equal(matches.some((session) => session.provider === "claude"), false);
});
