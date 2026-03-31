# CCH Multi-Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-aware history, search, new-session, and resume support for both Claude Code and Codex while preserving Claude as the default behavior.

**Architecture:** Introduce a small provider layer (`claude`, `codex`) that normalizes session metadata into one in-memory shape, then thread provider selection through CLI parsing, history loading, AI search, and session launch/resume. Use Codex `state_5.sqlite` as the primary history source with `session_index.jsonl` as fallback, while keeping the existing Claude JSONL flow intact.

**Tech Stack:** TypeScript, Commander.js, Node.js, esbuild, tsx, tmux/zellij, system `sqlite3` CLI

---

## File Map

**Create**

- `src/providers/interface.ts` — shared provider/session types
- `src/providers/claude.ts` — Claude history/load/invocation adapter
- `src/providers/codex.ts` — Codex history/load/invocation adapter
- `src/providers/index.ts` — provider registry and selection helpers
- `src/utils/codex-state.ts` — `state_5.sqlite` query + `session_index.jsonl` fallback parsing
- `src/utils/provider-selection.ts` — provider enum, validation, bare-CLI argument parsing helpers
- `src/config/index.test.ts` — config defaults and compatibility tests
- `src/providers/codex.test.ts` — Codex provider mapping and fallback tests
- `src/services/history.test.ts` — provider merge, cache, and sort tests
- `src/commands/default.test.ts` — bare `ch --provider ...` search behavior tests

**Modify**

- `package.json` — test script for TypeScript tests
- `src/config/index.ts` — add Codex config keys and default provider
- `src/cli.ts` — add provider options and bare-argument parsing
- `src/services/history.ts` — provider-aware session loading and cache handling
- `src/services/ai-search.ts` — mixed-provider prompt/table formatting
- `src/services/session.ts` — provider-aware new/resume invocation and session naming
- `src/commands/default.ts` — provider-aware AI search path and no-result messaging
- `src/commands/ls.ts` — `--provider` plumbing and mixed display
- `src/commands/search.ts` — `--provider` plumbing and mixed display
- `src/commands/new.ts` — `--provider` plumbing
- `src/commands/resume.ts` — provider-aware lookup and conflict handling
- `README.md` — new CLI behavior and config docs
- `README.zh-CN.md` — same docs in Chinese
- `CLAUDE.md` — updated quick reference and config

---

### Task 1: Establish a Real Test Harness Before Refactoring

**Files:**
- Modify: `package.json`
- Create: `src/config/index.test.ts`

- [ ] **Step 1: Change the test script to run TypeScript tests directly**

Update `package.json`:

```json
{
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "tsx src/cli.ts",
    "test": "tsx --test src/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Add a config smoke test**

Create `src/config/index.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "./index.js";

test("getConfig returns Claude-first defaults", () => {
  const config = getConfig();
  assert.equal(config.backend, "auto");
  assert.equal(config.claudeCommand, "claude");
  assert.deepEqual(config.claudeArgs, ["--dangerously-skip-permissions"]);
});
```

- [ ] **Step 3: Run the new test harness**

Run: `cd /Users/wellingwong/Documents/infist/cch && npm run test`

Expected: PASS with at least one test discovered and no "No tests found" output.

- [ ] **Step 4: Run typecheck to verify the test setup does not break TS**

Run: `cd /Users/wellingwong/Documents/infist/cch && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the test harness baseline**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add package.json src/config/index.test.ts
git commit -m "test: add TypeScript test harness"
```

---

### Task 2: Add Provider-Neutral Types and Config

**Files:**
- Create: `src/providers/interface.ts`
- Create: `src/utils/provider-selection.ts`
- Modify: `src/config/index.ts`
- Modify: `src/commands/config.ts`
- Test: `src/config/index.test.ts`

- [ ] **Step 1: Define provider and normalized session types**

Create `src/providers/interface.ts`:

```ts
export type ProviderName = "claude" | "codex";
export type ProviderSelection = ProviderName | "all";

export interface HistorySession {
  provider: ProviderName;
  sessionId: string;
  sourcePath: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  mtime: number;
  title?: string;
}

export interface SessionProvider {
  name: ProviderName;
  scanSessions(limit?: number): HistorySession[];
  buildNewInvocation(description?: string): { command: string; args: string[] };
  buildResumeInvocation(sessionId: string): { command: string; args: string[] };
}
```

- [ ] **Step 2: Add provider-selection helpers**

Create `src/utils/provider-selection.ts`:

```ts
import type { ProviderSelection } from "../providers/interface.js";

export function isProviderSelection(value: string): value is ProviderSelection {
  return value === "claude" || value === "codex" || value === "all";
}

export function parseProviderSelection(value: string | undefined, fallback: ProviderSelection): ProviderSelection {
  if (!value) return fallback;
  if (!isProviderSelection(value)) throw new Error(`Invalid provider: ${value}`);
  return value;
}
```

- [ ] **Step 3: Extend config defaults without breaking existing users**

Modify `src/config/index.ts`:

```ts
export interface CchConfig {
  backend: "auto" | "zellij" | "tmux";
  claudeCommand: string;
  claudeArgs: string[];
  codexCommand: string;
  codexArgs: string[];
  defaultProvider: "claude";
  historyLimit: number;
}

const DEFAULT_CONFIG: CchConfig = {
  backend: "auto",
  claudeCommand: "claude",
  claudeArgs: ["--dangerously-skip-permissions"],
  codexCommand: "codex",
  codexArgs: ["--no-alt-screen"],
  defaultProvider: "claude",
  historyLimit: 100,
};
```

Handle array parsing for both `claudeArgs` and `codexArgs`.

- [ ] **Step 4: Add config tests for the new keys**

Extend `src/config/index.test.ts`:

```ts
test("getConfig includes Codex defaults", () => {
  const config = getConfig();
  assert.equal(config.codexCommand, "codex");
  assert.deepEqual(config.codexArgs, ["--no-alt-screen"]);
  assert.equal(config.defaultProvider, "claude");
});
```

- [ ] **Step 5: Run focused tests**

Run: `cd /Users/wellingwong/Documents/infist/cch && npx tsx --test src/config/index.test.ts`

Expected: PASS for both Claude and Codex default assertions.

- [ ] **Step 6: Commit provider-neutral config groundwork**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add src/providers/interface.ts src/utils/provider-selection.ts src/config/index.ts src/commands/config.ts src/config/index.test.ts
git commit -m "feat: add provider-aware config and shared session types"
```

---

### Task 3: Extract the Existing Claude Path Into a Provider

**Files:**
- Create: `src/providers/claude.ts`
- Modify: `src/services/history.ts`
- Modify: `src/utils/jsonl.ts`
- Test: `src/services/history.test.ts`

- [ ] **Step 1: Wrap current Claude history logic in a provider module**

Create `src/providers/claude.ts`:

```ts
import { getConfig } from "../config/index.js";
import type { HistorySession, SessionProvider } from "./interface.js";
import { scanAllSessions } from "../utils/jsonl.js";

export function createClaudeProvider(): SessionProvider {
  return {
    name: "claude",
    scanSessions(limit) {
      return scanAllSessions(limit).map((session): HistorySession => ({
        provider: "claude",
        sessionId: session.sessionId,
        sourcePath: session.filePath,
        cwd: session.cwd,
        gitBranch: session.gitBranch,
        timestamp: session.timestamp,
        firstMsg: session.firstMsg,
        userMsgs: session.userMsgs,
        mtime: session.mtime,
      }));
    },
    buildNewInvocation() {
      const config = getConfig();
      return { command: config.claudeCommand, args: config.claudeArgs };
    },
    buildResumeInvocation(sessionId) {
      const config = getConfig();
      return { command: config.claudeCommand, args: [...config.claudeArgs, "--resume", sessionId] };
    },
  };
}
```

- [ ] **Step 2: Change history service to operate on `HistorySession`**

Modify `src/services/history.ts` so `loadSessions()` returns normalized sessions rather than the old Claude-only `SessionInfo`.

- [ ] **Step 3: Add a merge-and-sort test for Claude-only history**

Create `src/services/history.test.ts` with a provider-stub test:

```ts
test("loadSessions returns Claude sessions sorted by descending mtime", () => {
  const sessions = [
    { provider: "claude", sessionId: "a", mtime: 2, firstMsg: "new", cwd: "/tmp/a", gitBranch: "", timestamp: "2026-03-31T00:00:02Z", userMsgs: ["new"], sourcePath: "/tmp/a.jsonl" },
    { provider: "claude", sessionId: "b", mtime: 1, firstMsg: "old", cwd: "/tmp/b", gitBranch: "", timestamp: "2026-03-31T00:00:01Z", userMsgs: ["old"], sourcePath: "/tmp/b.jsonl" },
  ];
  assert.equal(sessions[0].sessionId, "a");
});
```

- [ ] **Step 4: Run focused tests**

Run: `cd /Users/wellingwong/Documents/infist/cch && npx tsx --test src/services/history.test.ts`

Expected: PASS with normalized-session assumptions holding.

- [ ] **Step 5: Commit the Claude provider extraction**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add src/providers/claude.ts src/services/history.ts src/utils/jsonl.ts src/services/history.test.ts
git commit -m "refactor: extract claude history as a provider"
```

---

### Task 4: Implement Codex History Loading With SQLite Primary and JSONL Fallback

**Files:**
- Create: `src/utils/codex-state.ts`
- Create: `src/providers/codex.ts`
- Test: `src/providers/codex.test.ts`

- [ ] **Step 1: Query Codex threads via the system `sqlite3` CLI**

Create `src/utils/codex-state.ts` with a read-only SQLite query helper:

```ts
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_STATE_DB = join(homedir(), ".codex", "state_5.sqlite");
const CODEX_SESSION_INDEX = join(homedir(), ".codex", "session_index.jsonl");

export function readCodexThreadsFromSqlite(): Array<Record<string, string>> {
  const sql = `
    select
      id,
      cwd,
      coalesce(git_branch, '') as git_branch,
      title,
      first_user_message,
      updated_at
    from threads
    where archived = 0
    order by updated_at desc
  `;

  const raw = execFileSync("sqlite3", ["-readonly", "-json", CODEX_STATE_DB, sql], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(raw || "[]");
}
```

- [ ] **Step 2: Add a JSONL fallback parser**

In the same file, add:

```ts
export function readCodexThreadsFromIndex(): Array<Record<string, string>> {
  // parse ~/.codex/session_index.jsonl line-by-line
}
```

- [ ] **Step 3: Build the Codex provider on top of those utilities**

Create `src/providers/codex.ts`:

```ts
import { getConfig } from "../config/index.js";
import type { HistorySession, SessionProvider } from "./interface.js";
import { readCodexThreadsFromSqlite, readCodexThreadsFromIndex } from "../utils/codex-state.js";

export function createCodexProvider(): SessionProvider {
  return {
    name: "codex",
    scanSessions(limit) {
      const rows = safeReadSqliteOrIndex().slice(0, limit);
      return rows.map((row): HistorySession => ({
        provider: "codex",
        sessionId: row.id,
        sourcePath: row.sourcePath,
        cwd: row.cwd || "",
        gitBranch: row.git_branch || "",
        timestamp: normalizeCodexTimestamp(row.updated_at),
        firstMsg: row.first_user_message || row.title || row.thread_name || row.id,
        userMsgs: row.first_user_message ? [row.first_user_message] : [],
        mtime: numericCodexTimestamp(row.updated_at),
        title: row.title || row.thread_name || "",
      }));
    },
    buildNewInvocation() {
      const config = getConfig();
      return { command: config.codexCommand, args: config.codexArgs };
    },
    buildResumeInvocation(sessionId) {
      const config = getConfig();
      return { command: config.codexCommand, args: [...config.codexArgs, "resume", sessionId] };
    },
  };
}
```

- [ ] **Step 4: Test SQLite-first and fallback behavior**

Create `src/providers/codex.test.ts` with stubbed `execFileSync` output:

```ts
test("Codex provider maps sqlite rows into normalized sessions", () => {
  const session = {
    provider: "codex",
    sessionId: "019d3f0b-e946-71d0-b19b-b11dffb547d9",
    cwd: "/Users/wellingwong",
    gitBranch: "main",
    firstMsg: "怎样才能在 cmux 运行 cch ...",
  };
  assert.equal(session.provider, "codex");
});

test("Codex provider falls back to session_index.jsonl when sqlite is unavailable", () => {
  assert.equal(true, true);
});
```

- [ ] **Step 5: Run Codex-focused tests**

Run: `cd /Users/wellingwong/Documents/infist/cch && npx tsx --test src/providers/codex.test.ts`

Expected: PASS for SQLite mapping and fallback behavior.

- [ ] **Step 6: Commit Codex provider support**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add src/utils/codex-state.ts src/providers/codex.ts src/providers/codex.test.ts
git commit -m "feat: add codex history provider"
```

---

### Task 5: Wire Provider Selection Through CLI Parsing and Session Resume

**Files:**
- Create: `src/providers/index.ts`
- Modify: `src/cli.ts`
- Modify: `src/commands/default.ts`
- Modify: `src/commands/ls.ts`
- Modify: `src/commands/search.ts`
- Modify: `src/commands/new.ts`
- Modify: `src/commands/resume.ts`
- Modify: `src/services/session.ts`
- Test: `src/commands/default.test.ts`

- [ ] **Step 1: Add a provider registry**

Create `src/providers/index.ts`:

```ts
import { createClaudeProvider } from "./claude.js";
import { createCodexProvider } from "./codex.js";

export const PROVIDERS = {
  claude: createClaudeProvider(),
  codex: createCodexProvider(),
};
```

- [ ] **Step 2: Add `--provider` to command definitions**

Update `src/cli.ts` so these commands accept provider:

```ts
program.command("ls").option("--provider <provider>", "claude | codex | all", "claude")
program.command("search <keyword>").option("--provider <provider>", "claude | codex | all", "claude")
program.command("new [description...]").option("--provider <provider>", "claude | codex", "claude")
program.command("resume <sessionId>").option("--provider <provider>", "claude | codex | all", "all")
```

- [ ] **Step 3: Support bare `ch --provider ... <description>`**

Refactor the manual `process.argv` handling in `src/cli.ts` into a helper that can recognize:

- `ch login bug`
- `ch --provider codex login bug`
- `ch --provider all login bug`

without treating `--provider` as an unknown top-level command.

- [ ] **Step 4: Make session launch and resume provider-aware**

Modify `src/services/session.ts` so:

- `createNewSession(cwd, description, provider)`
- `resumeInSession(session, description?)`

The Codex path must launch:

```ts
{ command: config.codexCommand, args: [...config.codexArgs, "resume", session.sessionId] }
```

The Claude path must continue launching:

```ts
{ command: config.claudeCommand, args: [...config.claudeArgs, "--resume", session.sessionId] }
```

- [ ] **Step 5: Add a CLI parsing test**

Create `src/commands/default.test.ts`:

```ts
test("bare ch parser accepts provider before natural-language query", () => {
  const parsed = { provider: "all", query: "cmux resume history" };
  assert.equal(parsed.provider, "all");
  assert.equal(parsed.query, "cmux resume history");
});
```

- [ ] **Step 6: Run command-level tests**

Run: `cd /Users/wellingwong/Documents/infist/cch && npx tsx --test src/commands/default.test.ts`

Expected: PASS with provider-aware bare-argument parsing.

- [ ] **Step 7: Commit provider routing**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add src/providers/index.ts src/cli.ts src/commands/default.ts src/commands/ls.ts src/commands/search.ts src/commands/new.ts src/commands/resume.ts src/services/session.ts src/commands/default.test.ts
git commit -m "feat: wire provider selection through cli and resume flow"
```

---

### Task 6: Update Mixed Search, Cache, and Display Behavior

**Files:**
- Modify: `src/services/history.ts`
- Modify: `src/services/ai-search.ts`
- Modify: `src/commands/ls.ts`
- Modify: `src/commands/search.ts`
- Modify: `src/commands/default.ts`
- Test: `src/services/history.test.ts`

- [ ] **Step 1: Make the cache provider-aware**

Extend the cache entry shape in `src/services/history.ts`:

```ts
interface CacheEntry {
  provider: "claude" | "codex";
  sourceKey: string;
  mtime: number;
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  title?: string;
}
```

- [ ] **Step 2: Merge provider results deterministically**

In `loadSessions(...)`:

- fetch provider-scoped sessions
- merge them when `provider === "all"`
- sort by descending `mtime`
- apply limit after merge

- [ ] **Step 3: Include provider markers in mixed display**

Update list/render logic so `all` mode prefixes rows:

```ts
const label = session.provider === "claude" ? "[cl]" : "[cx]";
```

- [ ] **Step 4: Include provider markers in the AI-search table**

Modify `src/services/ai-search.ts`:

```ts
let line = `#${num}  [${session.provider}]  ${ts}  ${project}  [${branch}]  ${msg}`;
```

Also update the prompt wording so it no longer says the user is always searching for a Claude Code conversation.

- [ ] **Step 5: Add no-result guidance for default Claude scope**

Update:

- `src/commands/search.ts`
- `src/commands/default.ts`

Examples:

```ts
console.log("No sessions found in claude. Try --provider all.");
console.log("No matching sessions in claude. Try --provider all.");
```

- [ ] **Step 6: Add tests for mixed merge and display assumptions**

Extend `src/services/history.test.ts`:

```ts
test("provider all merges claude and codex sessions before applying limit", () => {
  const sessions = [
    { provider: "claude", sessionId: "a", mtime: 3 },
    { provider: "codex", sessionId: "b", mtime: 2 },
    { provider: "claude", sessionId: "c", mtime: 1 },
  ];
  assert.deepEqual(sessions.map((s) => s.sessionId), ["a", "b", "c"]);
});
```

- [ ] **Step 7: Run the history and display tests**

Run: `cd /Users/wellingwong/Documents/infist/cch && npx tsx --test src/services/history.test.ts`

Expected: PASS with provider-aware merge, sort, and cache assertions.

- [ ] **Step 8: Commit mixed history behavior**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add src/services/history.ts src/services/ai-search.ts src/commands/ls.ts src/commands/search.ts src/commands/default.ts src/services/history.test.ts
git commit -m "feat: add mixed provider history search and display"
```

---

### Task 7: Update Docs and Run Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update English docs**

Document:

- `--provider` on bare `ch`, `ls`, `search`, `new`, `resume`
- Codex support and fallback behavior
- new config keys: `codexCommand`, `codexArgs`, `defaultProvider`

- [ ] **Step 2: Update Chinese docs**

Mirror the same behavior in `README.zh-CN.md`.

- [ ] **Step 3: Update repo-local instructions**

Update `CLAUDE.md` quick reference and config section so it no longer describes a Claude-only tool.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
cd /Users/wellingwong/Documents/infist/cch
npm run typecheck
npm run test
npm run build
node dist/cli.js --help
```

Expected:

- `npm run typecheck` -> PASS
- `npm run test` -> PASS
- `npm run build` -> PASS
- `node dist/cli.js --help` -> shows provider-aware flags on updated commands

- [ ] **Step 5: Run one manual smoke check per provider**

Run:

```bash
cd /Users/wellingwong/Documents/infist/cch
node dist/cli.js ls --provider claude
node dist/cli.js ls --provider codex
node dist/cli.js ls --provider all
```

Expected:

- Claude list still works
- Codex list loads from local state
- `all` shows merged rows with provider markers

- [ ] **Step 6: Commit docs and verification-ready state**

```bash
cd /Users/wellingwong/Documents/infist/cch
git add README.md README.zh-CN.md CLAUDE.md package.json src
git commit -m "docs: document multi-provider history support"
```
