import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import type { HistorySession } from "../providers/interface.js";

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "cch-history-"));
process.env.HOME = tempHome;

const historyModuleUrl = new URL(`./history.ts?smoke=${Date.now()}`, import.meta.url);
const { loadSessions } = await import(historyModuleUrl.href);
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
  const cachePath = join(tempHome, ".config", "cch", "cache.json");
  mkdirSync(join(cachePath, ".."), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
}

function resetFixtures(): void {
  rmSync(join(tempHome, ".claude"), { recursive: true, force: true });
  rmSync(join(tempHome, ".config"), { recursive: true, force: true });
}

beforeEach(() => {
  resetFixtures();
});

test("loadSessions returns normalized Claude sessions", () => {
  const filePath = writeClaudeSession("demo-project", "session-one.jsonl", {
    cwd: "/workspace/alpha",
    gitBranch: "main",
    timestamp: "2026-03-31T10:00:00.000Z",
    firstMsg: "Hello Claude",
  });

  writeCache({});

  const sessions = loadSessions();

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

test("loadSessions keeps cached Claude entries sorted by mtime", () => {
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
  const olderMtime = statSync(olderPath).mtimeMs;

  writeCache({
    [olderPath]: {
      mtime: olderMtime,
      sessionId: "older",
      cwd: "/workspace/cached",
      gitBranch: "cached-branch",
      timestamp: "2026-03-30T10:00:00.000Z",
      firstMsg: "Cached older session",
      userMsgs: ["Cached older session"],
    },
  });

  const sessions = loadSessions(2) as HistorySession[];

  assert.deepEqual(
    sessions.map((session) => session.sourcePath),
    [newerPath, olderPath],
  );
  assert.equal(sessions[1].firstMsg, "Cached older session");
  assert.equal(sessions[1].provider, "claude");
});
