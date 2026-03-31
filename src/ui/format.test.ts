import { strict as assert } from "node:assert";
import test from "node:test";
import { formatSessionLines } from "./format.js";
import type { HistorySession } from "../providers/interface.js";

function makeSession(overrides: Partial<HistorySession> = {}): HistorySession {
  return {
    provider: "claude",
    sessionId: "session-1",
    sourcePath: "/tmp/session.jsonl",
    cwd: "/workspace/demo-app",
    gitBranch: "main",
    timestamp: "2026-03-31T10:00:00.000Z",
    firstMsg: "Resume auth flow work",
    userMsgs: ["Resume auth flow work"],
    mtime: Date.parse("2026-03-31T10:00:00.000Z"),
    ...overrides,
  };
}

test("formatSessionLines prefixes mixed-provider rows in all mode", () => {
  const lines = formatSessionLines([
    makeSession({
      provider: "claude",
      sessionId: "claude-1",
      cwd: "/workspace/claude-app",
    }),
    makeSession({
      provider: "codex",
      sessionId: "codex-1",
      cwd: "/workspace/codex-app",
    }),
  ], "all");

  assert.match(lines[0], /\[cl\]/);
  assert.match(lines[1], /\[cx\]/);
});

test("formatSessionLines omits provider markers outside all mode", () => {
  const [line] = formatSessionLines([
    makeSession(),
  ], "claude");

  assert.doesNotMatch(line, /\[cl\]|\[cx\]/);
  assert.match(line, /demo-app/);
});
