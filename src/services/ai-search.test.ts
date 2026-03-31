import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { after, beforeEach, mock, test } from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HistorySession } from "../providers/interface.js";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process") as typeof import("node:child_process");

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "cch-ai-search-"));
process.env.HOME = tempHome;

after(() => {
  mock.restoreAll();
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

beforeEach(() => {
  mock.restoreAll();
  rmSync(join(tempHome, ".claude"), { recursive: true, force: true });
  rmSync(join(tempHome, ".claude-mem"), { recursive: true, force: true });
  mkdirSync(join(tempHome, ".claude-mem"), { recursive: true });
  writeFileSync(join(tempHome, ".claude-mem", "claude-mem.db"), "");
});

function writeClaudeSession(
  sessionId: string,
  timestamp: string,
  firstMsg: string,
): void {
  const filePath = join(tempHome, ".claude", "projects", "demo", `${sessionId}.jsonl`);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(
    filePath,
    [
      JSON.stringify({
        type: "system",
        cwd: "/workspace/demo",
        gitBranch: "main",
        timestamp,
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "text", text: firstMsg }],
        },
      }),
    ].join("\n") + "\n",
  );
}

test("aiSearch preserves mem-search relevance order when mapping session ids", { concurrency: false }, async () => {
  writeClaudeSession("alpha", "2026-03-31T09:00:00.000Z", "Older alpha session");
  writeClaudeSession("beta", "2026-03-31T10:00:00.000Z", "Newer beta session");

  mock.method(childProcess, "execFileSync", (command: string, args: string[]) => {
    if (command === "claude") {
      return JSON.stringify({
        structured_output: {
          observationIds: [101, 102],
        },
      });
    }

    if (command === "sqlite3") {
      const sql = args[1] ?? "";
      if (sql.includes("o.created_at_epoch DESC")) {
        return "beta\nalpha\n";
      }

      if (sql.includes("CASE o.id")) {
        return "alpha\nbeta\n";
      }
    }

    throw new Error(`Unexpected command: ${command}`);
  });

  const { aiSearch } = await import(new URL(`./ai-search.ts?smoke=${Date.now()}`, import.meta.url).href);
  const results = aiSearch("demo query");

  assert.deepEqual(
    results.map((session: HistorySession) => session.sessionId),
    ["alpha", "beta"],
  );
});
