# CCH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `cch` — a Node.js CLI tool (`ch` command) for managing Claude Code conversation history across projects with AI search and Zellij/tmux session management.

**Architecture:** Commander.js CLI with two core services (HistoryService for .jsonl scanning/caching/AI-search, SessionService for multiplexer lifecycle) backed by a pluggable SessionBackend interface (Zellij, tmux). Single runtime dependency (commander).

**Tech Stack:** TypeScript, Commander.js, esbuild, Node.js >= 18

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bin/ch.js`
- Create: `src/cli.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd /home/user/projects/cch
```

Create `package.json`:

```json
{
  "name": "cch",
  "version": "0.1.0",
  "description": "Claude Code History — AI-powered conversation history management with Zellij/tmux session support",
  "type": "module",
  "bin": {
    "ch": "./bin/ch.js"
  },
  "main": "./dist/cli.js",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "tsx src/cli.ts",
    "test": "node --test dist/**/*.test.js",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["claude", "claude-code", "history", "session", "zellij", "tmux", "cli"],
  "license": "MIT",
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander
npm install -D typescript tsx esbuild @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

- [ ] **Step 5: Create esbuild.config.mjs**

```javascript
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/cli.js",
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
  external: [],
});
```

- [ ] **Step 6: Create bin/ch.js**

```javascript
#!/usr/bin/env node
import "../dist/cli.js";
```

- [ ] **Step 7: Create minimal src/cli.ts**

```typescript
import { Command } from "commander";

const program = new Command();

program
  .name("ch")
  .description("Claude Code History — manage conversation history across projects")
  .version("0.1.0");

program.parse();
```

- [ ] **Step 8: Build and test**

```bash
npm run build
node dist/cli.js --help
```

Expected: Help text with "Claude Code History — manage conversation history across projects"

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: project scaffold with Commander.js CLI"
```

---

### Task 2: Config Service

**Files:**
- Create: `src/config/index.ts`

- [ ] **Step 1: Create config service**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "cch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSIONS_FILE = join(CONFIG_DIR, "sessions.json");
const CACHE_FILE = join(CONFIG_DIR, "cache.json");

export interface CchConfig {
  backend: "auto" | "zellij" | "tmux";
  claudeCommand: string;
  claudeArgs: string[];
  historyLimit: number;
}

export interface SessionMeta {
  description: string;
  cwd: string;
  createdAt: string;
}

const DEFAULT_CONFIG: CchConfig = {
  backend: "auto",
  claudeCommand: "claude",
  claudeArgs: ["--dangerously-skip-permissions"],
  historyLimit: 100,
};

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function getConfig(): CchConfig {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<CchConfig>>(CONFIG_FILE, {}) };
}

export function setConfig(key: string, value: string): void {
  const config = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  if (key === "claudeArgs") {
    config[key] = value.split(",").map((s) => s.trim());
  } else if (key === "historyLimit") {
    config[key] = parseInt(value, 10);
  } else {
    config[key] = value;
  }
  writeJson(CONFIG_FILE, config);
}

export function getSessionsMeta(): Record<string, SessionMeta> {
  return readJson<Record<string, SessionMeta>>(SESSIONS_FILE, {});
}

export function setSessionMeta(name: string, meta: SessionMeta): void {
  const sessions = getSessionsMeta();
  sessions[name] = meta;
  writeJson(SESSIONS_FILE, sessions);
}

export function removeSessionMeta(name: string): void {
  const sessions = getSessionsMeta();
  delete sessions[name];
  writeJson(SESSIONS_FILE, sessions);
}

export function getCache(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(CACHE_FILE, {});
}

export function writeCache(data: Record<string, unknown>): void {
  writeJson(CACHE_FILE, data);
}

export { CONFIG_DIR };
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/index.ts
git commit -m "feat: config service with config, sessions, and cache persistence"
```

---

### Task 3: Utils — JSONL Parser and Display Helpers

**Files:**
- Create: `src/utils/jsonl.ts`
- Create: `src/utils/display.ts`

- [ ] **Step 1: Create jsonl.ts**

```typescript
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface SessionInfo {
  sessionId: string;
  filePath: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  mtime: number;
}

function stripTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "")
    .trim();
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && item.type === "text" && typeof item.text === "string") {
        return stripTags(item.text);
      }
    }
  }
  return "";
}

export function parseJsonl(filePath: string): SessionInfo | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").slice(0, 50);

    let cwd = "";
    let gitBranch = "";
    let timestamp = "";
    let firstMsg = "";
    const userMsgs: string[] = [];
    const sessionId = basename(filePath, ".jsonl");

    for (const line of lines) {
      if (!line.trim()) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && typeof data.cwd === "string") cwd = data.cwd;
      if (!gitBranch && typeof data.gitBranch === "string") gitBranch = data.gitBranch;
      if (!timestamp && typeof data.timestamp === "string") timestamp = data.timestamp;

      if (data.type === "user") {
        const msg = data.message as Record<string, unknown> | undefined;
        if (msg) {
          const text = extractUserText(msg.content);
          if (text) {
            if (!firstMsg) firstMsg = text.slice(0, 150);
            if (userMsgs.length < 5) userMsgs.push(text.slice(0, 100));
          }
        }
      }
    }

    if (!firstMsg) return null;

    const mtime = statSync(filePath).mtimeMs;
    if (!timestamp) {
      timestamp = new Date(mtime).toISOString();
    }

    return { sessionId, filePath, cwd, gitBranch, timestamp, firstMsg, userMsgs, mtime };
  } catch {
    return null;
  }
}

export function scanAllSessions(limit: number): SessionInfo[] {
  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const sessions: SessionInfo[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = join(PROJECTS_DIR, dir.name);
      const files = readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const info = parseJsonl(join(projectPath, file.name));
        if (info) sessions.push(info);
      }
    }

    sessions.sort((a, b) => b.mtime - a.mtime);
    return sessions.slice(0, limit);
  } catch {
    return [];
  }
}

export function decodePath(dirname: string): string {
  if (dirname.startsWith("-")) {
    return "/" + dirname.slice(1).replace(/-/g, "/");
  }
  return dirname.replace(/-/g, "/");
}

export function shortenPath(path: string): string {
  const home = homedir();
  let p = path.startsWith(home) ? "~" + path.slice(home.length) : path;
  const parts = p.split("/");
  if (parts.length > 4) p = ".../" + parts.slice(-3).join("/");
  return p;
}
```

- [ ] **Step 2: Create display.ts**

```typescript
import type { SessionInfo } from "./jsonl.js";
import { shortenPath, decodePath } from "./jsonl.js";
import { getSessionsMeta } from "../config/index.js";

export function formatSessionTable(sessions: SessionInfo[]): string {
  const header = `  #  Time              Project                        Branch          First Message`;
  const divider = "─".repeat(100);
  const rows = sessions.map((s, i) => {
    const num = String(i + 1).padStart(3);
    const ts = (s.timestamp.slice(0, 16).replace("T", " ")) || "";
    const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0])).padEnd(30);
    const branch = (s.gitBranch || "-").slice(0, 14).padEnd(15);
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 50);
    return `${num}  ${ts}  ${project}  ${branch}  ${msg}`;
  });
  return [header, divider, ...rows].join("\n");
}

export function formatActiveSessions(
  sessions: Array<{ name: string; created: string; status: string }>,
): string {
  const meta = getSessionsMeta();
  const claude: string[] = [];
  const other: string[] = [];

  for (const s of sessions) {
    const desc = meta[s.name]?.description;
    const line = `  ${s.name.padEnd(25)} ${s.created.padEnd(12)} ${desc ? `  ${desc}` : ""}`;
    if (s.name.startsWith("ch-")) {
      claude.push(line);
    } else {
      other.push(line);
    }
  }

  const parts: string[] = [];
  parts.push("Claude Sessions:");
  parts.push("─".repeat(50));
  parts.push(claude.length ? claude.join("\n") : "  (none)");
  parts.push("");
  parts.push("Other Sessions:");
  parts.push("─".repeat(50));
  parts.push(other.length ? other.join("\n") : "  (none)");
  return parts.join("\n");
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/
git commit -m "feat: jsonl parser and display formatting utilities"
```

---

### Task 4: History Service with Cache

**Files:**
- Create: `src/services/history.ts`

- [ ] **Step 1: Create history.ts**

```typescript
import { statSync } from "node:fs";
import { scanAllSessions, parseJsonl, type SessionInfo } from "../utils/jsonl.js";
import { getCache, writeCache, getConfig } from "../config/index.js";

interface CacheEntry {
  mtime: number;
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
}

export function loadSessions(limit?: number): SessionInfo[] {
  const config = getConfig();
  const n = limit ?? config.historyLimit;
  const cache = getCache() as Record<string, CacheEntry>;
  const sessions = scanAllSessions(n);
  const newCache: Record<string, CacheEntry> = {};

  const result: SessionInfo[] = [];
  for (const s of sessions) {
    const cached = cache[s.filePath];
    if (cached && cached.mtime === s.mtime) {
      result.push({
        sessionId: cached.sessionId,
        filePath: s.filePath,
        cwd: cached.cwd,
        gitBranch: cached.gitBranch,
        timestamp: cached.timestamp,
        firstMsg: cached.firstMsg,
        userMsgs: cached.userMsgs,
        mtime: cached.mtime,
      });
      newCache[s.filePath] = cached;
    } else {
      result.push(s);
      newCache[s.filePath] = {
        mtime: s.mtime,
        sessionId: s.sessionId,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        timestamp: s.timestamp,
        firstMsg: s.firstMsg,
        userMsgs: s.userMsgs,
      };
    }
  }

  writeCache(newCache as unknown as Record<string, unknown>);
  return result;
}

export function searchSessions(keyword: string): SessionInfo[] {
  const { readFileSync } = await import("node:fs");
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");

  const PROJECTS_DIR = join(homedir(), ".claude", "projects");
  const matches: SessionInfo[] = [];

  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = join(PROJECTS_DIR, dir.name);
      const files = readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const filePath = join(projectPath, file.name);
        try {
          const content = readFileSync(filePath, "utf-8");
          if (content.toLowerCase().includes(keyword.toLowerCase())) {
            const info = parseJsonl(filePath);
            if (info) matches.push(info);
          }
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* no projects dir */ }

  matches.sort((a, b) => b.mtime - a.mtime);
  return matches;
}
```

- [ ] **Step 2: Fix the async import issue — use top-level imports instead**

Replace the `searchSessions` function with synchronous imports (they're already available from jsonl.ts re-exports):

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { scanAllSessions, parseJsonl, type SessionInfo } from "../utils/jsonl.js";
import { getCache, writeCache, getConfig } from "../config/index.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

// ... (loadSessions stays the same)

export function searchSessions(keyword: string): SessionInfo[] {
  const matches: SessionInfo[] = [];

  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = join(PROJECTS_DIR, dir.name);
      const files = readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const filePath = join(projectPath, file.name);
        try {
          const content = readFileSync(filePath, "utf-8");
          if (content.toLowerCase().includes(keyword.toLowerCase())) {
            const info = parseJsonl(filePath);
            if (info) matches.push(info);
          }
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* no projects dir */ }

  matches.sort((a, b) => b.mtime - a.mtime);
  return matches;
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/services/history.ts
git commit -m "feat: history service with caching and keyword search"
```

---

### Task 5: AI Search Service

**Files:**
- Create: `src/services/ai-search.ts`

- [ ] **Step 1: Create ai-search.ts**

```typescript
import { execFileSync } from "node:child_process";
import { getConfig } from "../config/index.js";
import { shortenPath, decodePath } from "../utils/jsonl.js";
import type { SessionInfo } from "../utils/jsonl.js";

function buildTable(sessions: SessionInfo[]): string {
  return sessions
    .map((s, i) => {
      const num = i + 1;
      const ts = s.timestamp.slice(0, 16).replace("T", " ");
      const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0]));
      const branch = s.gitBranch || "-";
      const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 80);
      const extra = s.userMsgs
        .slice(1, 4)
        .map((m) => m.replace(/\n/g, " ").slice(0, 60))
        .join(" / ");
      let line = `#${num}  ${ts}  ${project}  [${branch}]  ${msg}`;
      if (extra) line += `  more: ${extra}`;
      return line;
    })
    .join("\n");
}

export function aiSearch(query: string, sessions: SessionInfo[]): number[] {
  const config = getConfig();
  const table = buildTable(sessions);

  const prompt = `你是一个会话历史搜索助手。用户想找到之前的某个 Claude Code 对话。

以下是所有会话列表（按时间倒序，#编号 时间 项目路径 [分支] 首条消息）：

${table}

用户的描述："${query}"

请从列表中找出最匹配的 1-3 个会话。只返回编号，用逗号分隔，不要其他文字。
如果没有匹配的，返回 "0"。
例如：3,7,12`;

  try {
    const result = execFileSync(config.claudeCommand, ["-p", prompt], {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const indices: number[] = [];
    for (const part of result.trim().replace(/\s/g, "").split(",")) {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= sessions.length) {
        indices.push(n);
      }
    }
    return indices;
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/services/ai-search.ts
git commit -m "feat: AI search service using claude -p"
```

---

### Task 6: Backend Interface and Detection

**Files:**
- Create: `src/backends/interface.ts`
- Create: `src/backends/detect.ts`

- [ ] **Step 1: Create interface.ts**

```typescript
export interface ActiveSession {
  name: string;
  created: string;
  status: "running" | "exited";
}

export interface CreateSessionOpts {
  name: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface SessionBackend {
  name: string;
  isAvailable(): boolean;
  listSessions(): ActiveSession[];
  createSession(opts: CreateSessionOpts): void;
  attachSession(name: string): void;
  killSession(name: string): void;
}
```

- [ ] **Step 2: Create detect.ts**

```typescript
import { execFileSync } from "node:child_process";
import { getConfig } from "../config/index.js";
import type { SessionBackend } from "./interface.js";

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function detectBackend(): Promise<SessionBackend> {
  const config = getConfig();

  if (config.backend === "zellij" || (config.backend === "auto" && commandExists("zellij"))) {
    const { ZellijBackend } = await import("./zellij.js");
    return new ZellijBackend();
  }

  if (config.backend === "tmux" || (config.backend === "auto" && commandExists("tmux"))) {
    const { TmuxBackend } = await import("./tmux.js");
    return new TmuxBackend();
  }

  console.error("Error: No terminal multiplexer found. Please install Zellij or tmux.");
  console.error("  brew install zellij   # or");
  console.error("  brew install tmux");
  process.exit(1);
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/backends/interface.ts src/backends/detect.ts
git commit -m "feat: session backend interface and auto-detection"
```

---

### Task 7: Zellij Backend

**Files:**
- Create: `src/backends/zellij.ts`

- [ ] **Step 1: Create zellij.ts**

```typescript
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionBackend, ActiveSession, CreateSessionOpts } from "./interface.js";

export class ZellijBackend implements SessionBackend {
  name = "zellij";

  isAvailable(): boolean {
    try {
      execFileSync("which", ["zellij"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): ActiveSession[] {
    try {
      const raw = execFileSync("zellij", ["ls"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
          const name = clean.split(/\s+/)[0];
          const hasExited = clean.includes("EXITED");
          const createdMatch = clean.match(/Created\s+(.+?)\s*ago/);
          const created = createdMatch ? createdMatch[1] + " ago" : "";
          return {
            name,
            created,
            status: hasExited ? "exited" as const : "running" as const,
          };
        })
        .filter((s) => s.name);
    } catch {
      return [];
    }
  }

  createSession(opts: CreateSessionOpts): void {
    const dir = join(tmpdir(), "cch-zellij");
    mkdirSync(dir, { recursive: true });

    const safeArgs = opts.args.map((a) => `"${a}"`).join(" ");
    const layoutPath = join(dir, `${opts.name}-layout.kdl`);
    const configPath = join(dir, `${opts.name}-config.kdl`);

    writeFileSync(
      layoutPath,
      `layout {\n    pane command="${opts.command}" cwd="${opts.cwd}" {\n        args ${safeArgs}\n    }\n}\n`,
    );

    writeFileSync(
      configPath,
      `session_name "${opts.name}"\nattach_to_session true\ndefault_layout "${layoutPath}"\n`,
    );

    // execSync replaces current process for attach behavior
    const { execSync } = require("node:child_process");
    execSync(`zellij --config "${configPath}"`, { stdio: "inherit" });
  }

  attachSession(name: string): void {
    execSync(`zellij attach "${name}"`, { stdio: "inherit" });
  }

  killSession(name: string): void {
    try {
      execFileSync("zellij", ["kill-session", name], { stdio: "pipe" });
    } catch {
      // session might not exist
    }
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/backends/zellij.ts
git commit -m "feat: Zellij backend with session create/attach/kill/list"
```

---

### Task 8: tmux Backend

**Files:**
- Create: `src/backends/tmux.ts`

- [ ] **Step 1: Create tmux.ts**

```typescript
import { execFileSync, execSync } from "node:child_process";
import type { SessionBackend, ActiveSession, CreateSessionOpts } from "./interface.js";

export class TmuxBackend implements SessionBackend {
  name = "tmux";

  isAvailable(): boolean {
    try {
      execFileSync("which", ["tmux"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): ActiveSession[] {
    try {
      const raw = execFileSync("tmux", ["list-sessions", "-F", "#{session_name} #{session_created}"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.trim().split(" ");
          const name = parts[0];
          const epoch = parseInt(parts[1], 10);
          const ago = epoch ? formatAgo(epoch) : "";
          return { name, created: ago, status: "running" as const };
        });
    } catch {
      return [];
    }
  }

  createSession(opts: CreateSessionOpts): void {
    const cmd = [opts.command, ...opts.args].join(" ");

    // Check if session already exists → attach
    try {
      execFileSync("tmux", ["has-session", "-t", opts.name], { stdio: "pipe" });
      execSync(`tmux attach -t "${opts.name}"`, { stdio: "inherit" });
      return;
    } catch {
      // session doesn't exist, create it
    }

    execSync(
      `tmux new-session -d -s "${opts.name}" -c "${opts.cwd}" '${cmd}'`,
      { stdio: "pipe" },
    );
    execSync(`tmux attach -t "${opts.name}"`, { stdio: "inherit" });
  }

  attachSession(name: string): void {
    execSync(`tmux attach -t "${name}"`, { stdio: "inherit" });
  }

  killSession(name: string): void {
    try {
      execFileSync("tmux", ["kill-session", "-t", name], { stdio: "pipe" });
    } catch {
      // session might not exist
    }
  }
}

function formatAgo(epoch: number): string {
  const diff = Math.floor(Date.now() / 1000) - epoch;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/backends/tmux.ts
git commit -m "feat: tmux backend with session create/attach/kill/list"
```

---

### Task 9: Session Service

**Files:**
- Create: `src/services/session.ts`

- [ ] **Step 1: Create session.ts**

```typescript
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { getConfig, setSessionMeta, removeSessionMeta } from "../config/index.js";
import { detectBackend } from "../backends/detect.js";
import type { SessionBackend, ActiveSession } from "../backends/interface.js";

let _backend: SessionBackend | null = null;

async function getBackend(): Promise<SessionBackend> {
  if (!_backend) _backend = await detectBackend();
  return _backend;
}

export function makeSessionName(cwd: string, description?: string): string {
  const dirName = basename(cwd);
  if (!description) return `ch-${dirName}`;
  const hash = createHash("md5").update(description).digest("hex").slice(0, 6);
  return `ch-${dirName}-${hash}`;
}

export async function createNewSession(cwd: string, description?: string): Promise<void> {
  const backend = await getBackend();
  const config = getConfig();
  const name = makeSessionName(cwd, description);

  setSessionMeta(name, {
    description: description || "",
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: config.claudeCommand,
    args: config.claudeArgs,
    cwd,
  });
}

export async function forceNewSession(cwd: string, description?: string): Promise<void> {
  const backend = await getBackend();
  const name = makeSessionName(cwd, description);
  backend.killSession(name);
  removeSessionMeta(name);
  await createNewSession(cwd, description);
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const backend = await getBackend();
  return backend.listSessions();
}

export async function attachToSession(name: string): Promise<void> {
  const backend = await getBackend();
  backend.attachSession(name);
}

export async function killSession(name: string): Promise<void> {
  const backend = await getBackend();
  backend.killSession(name);
  removeSessionMeta(name);
}

export async function resumeInSession(sessionId: string, cwd: string): Promise<void> {
  const backend = await getBackend();
  const config = getConfig();
  const dirName = basename(cwd);
  const name = `ch-${dirName}-${sessionId.slice(0, 8)}`;

  setSessionMeta(name, {
    description: `resumed: ${sessionId.slice(0, 8)}`,
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: config.claudeCommand,
    args: ["--resume", sessionId],
    cwd,
  });
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/services/session.ts
git commit -m "feat: session service for create/kill/attach/resume"
```

---

### Task 10: All Commands + CLI Wiring

**Files:**
- Create: `src/commands/default.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/search.ts`
- Create: `src/commands/new.ts`
- Create: `src/commands/ls.ts`
- Create: `src/commands/attach.ts`
- Create: `src/commands/kill.ts`
- Create: `src/commands/resume.ts`
- Create: `src/commands/config.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Create src/commands/list.ts**

```typescript
import { loadSessions } from "../services/history.js";
import { formatSessionTable } from "../utils/display.js";

export function listCommand(n: number): void {
  const sessions = loadSessions(n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }
  console.log(formatSessionTable(sessions));
  console.log(`\n${sessions.length} sessions total.\n`);
}
```

- [ ] **Step 2: Create src/commands/search.ts**

```typescript
import { searchSessions } from "../services/history.js";
import { shortenPath, decodePath } from "../utils/jsonl.js";
import { resumeInSession } from "../services/session.js";
import { createInterface } from "node:readline";

export async function searchCommand(keyword: string): Promise<void> {
  console.log(`Searching "${keyword}" ...`);
  const matches = searchSessions(keyword);

  if (!matches.length) {
    console.log(`No sessions found containing "${keyword}"`);
    return;
  }

  console.log(`\nFound ${matches.length} sessions:\n`);
  for (let i = 0; i < Math.min(matches.length, 15); i++) {
    const s = matches[i];
    const ts = s.timestamp.slice(0, 16).replace("T", " ");
    const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0]));
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 50);
    console.log(`  ${String(i + 1).padStart(2)}  ${ts}  ${project.padEnd(28)}  ${msg}`);
  }

  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("\nEnter number to resume (Enter to exit): ", resolve);
    });
    rl.close();
    const idx = parseInt(answer, 10);
    if (idx >= 1 && idx <= matches.length) {
      const s = matches[idx - 1];
      await resumeInSession(s.sessionId, s.cwd);
    }
  }
}
```

- [ ] **Step 3: Create src/commands/default.ts**

```typescript
import { loadSessions } from "../services/history.js";
import { aiSearch } from "../services/ai-search.js";
import { resumeInSession } from "../services/session.js";
import { shortenPath, decodePath } from "../utils/jsonl.js";
import { createInterface } from "node:readline";

export async function defaultCommand(query: string): Promise<void> {
  console.log(`Searching for "${query}" ...\n`);

  const sessions = loadSessions();
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  const indices = aiSearch(query, sessions);
  if (!indices.length) {
    console.log("No matching sessions. Try `ch list` to browse all.");
    return;
  }

  console.log(`Found ${indices.length} matching session(s):\n`);
  for (let rank = 0; rank < indices.length; rank++) {
    const s = sessions[indices[rank] - 1];
    const ts = s.timestamp.slice(0, 16).replace("T", " ");
    const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0]));
    const branch = s.gitBranch || "-";
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 70);
    console.log(`  [${rank + 1}] #${indices[rank]}  ${ts}  ${project}  [${branch}]`);
    console.log(`       ${msg}\n`);
  }

  if (!process.stdin.isTTY) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (indices.length === 1) {
    const answer = await new Promise<string>((resolve) => {
      rl.question("Resume this session? (Enter to confirm / n to cancel): ", resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() !== "n") {
      const s = sessions[indices[0] - 1];
      await resumeInSession(s.sessionId, s.cwd);
    }
  } else {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Pick [1-${indices.length}] to resume (Enter to exit): `, resolve);
    });
    rl.close();
    const pick = parseInt(answer, 10);
    if (pick >= 1 && pick <= indices.length) {
      const s = sessions[indices[pick - 1] - 1];
      await resumeInSession(s.sessionId, s.cwd);
    }
  }
}
```

- [ ] **Step 4: Create src/commands/new.ts**

```typescript
import { createNewSession, forceNewSession } from "../services/session.js";

export async function newCommand(description: string | undefined, force: boolean): Promise<void> {
  const cwd = process.cwd();
  if (force) {
    await forceNewSession(cwd, description);
  } else {
    await createNewSession(cwd, description);
  }
}
```

- [ ] **Step 5: Create src/commands/ls.ts**

```typescript
import { listActiveSessions } from "../services/session.js";
import { formatActiveSessions } from "../utils/display.js";

export async function lsCommand(): Promise<void> {
  const sessions = await listActiveSessions();
  if (!sessions.length) {
    console.log("No active multiplexer sessions.");
    return;
  }
  console.log(formatActiveSessions(sessions));
}
```

- [ ] **Step 6: Create src/commands/attach.ts**

```typescript
import { attachToSession } from "../services/session.js";

export async function attachCommand(name: string): Promise<void> {
  await attachToSession(name);
}
```

- [ ] **Step 7: Create src/commands/kill.ts**

```typescript
import { killSession } from "../services/session.js";

export async function killCommand(name: string): Promise<void> {
  await killSession(name);
  console.log(`Killed session: ${name}`);
}
```

- [ ] **Step 8: Create src/commands/resume.ts**

```typescript
import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { decodePath } from "../utils/jsonl.js";

export async function resumeCommand(sessionId: string): Promise<void> {
  const sessions = loadSessions();
  const match = sessions.find((s) => s.sessionId === sessionId);

  if (match) {
    await resumeInSession(match.sessionId, match.cwd);
  } else {
    console.error(`Session not found: ${sessionId}`);
    console.error("Try `ch list` to see available sessions.");
  }
}
```

- [ ] **Step 9: Create src/commands/config.ts**

```typescript
import { getConfig, setConfig } from "../config/index.js";

export function configCommand(key?: string, value?: string): void {
  if (key && value) {
    setConfig(key, value);
    console.log(`Set ${key} = ${value}`);
    return;
  }

  const config = getConfig();
  console.log("\nCCH Configuration (~/.config/cch/config.json):\n");
  for (const [k, v] of Object.entries(config)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
  console.log();
}
```

- [ ] **Step 10: Wire up src/cli.ts**

```typescript
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { searchCommand } from "./commands/search.js";
import { defaultCommand } from "./commands/default.js";
import { newCommand } from "./commands/new.js";
import { lsCommand } from "./commands/ls.js";
import { attachCommand } from "./commands/attach.js";
import { killCommand } from "./commands/kill.js";
import { resumeCommand } from "./commands/resume.js";
import { configCommand } from "./commands/config.js";
import { loadSessions } from "./services/history.js";
import { formatSessionTable } from "./utils/display.js";

const program = new Command();

program
  .name("ch")
  .description("Claude Code History — manage conversation history across projects")
  .version("0.1.0");

program
  .command("list")
  .description("List recent sessions from history")
  .option("-n, --number <n>", "Number of sessions to show", "20")
  .action((opts) => listCommand(parseInt(opts.number, 10)));

program
  .command("search <keyword>")
  .description("Search sessions by keyword")
  .action((keyword) => searchCommand(keyword));

program
  .command("new [description...]")
  .description("Create a new Claude session in current directory")
  .option("-f, --force", "Kill existing session with same name first")
  .action((desc, opts) => newCommand(desc?.join(" ") || undefined, opts.force || false));

program
  .command("ls")
  .description("List active multiplexer sessions")
  .action(() => lsCommand());

program
  .command("attach <name>")
  .description("Attach to an active multiplexer session")
  .action((name) => attachCommand(name));

program
  .command("kill <name>")
  .description("Kill a multiplexer session")
  .action((name) => killCommand(name));

program
  .command("resume <sessionId>")
  .description("Resume a session by ID in multiplexer")
  .action((id) => resumeCommand(id));

program
  .command("config [key] [value]")
  .description("Show or set configuration")
  .action((key, value) => configCommand(key, value));

// Default behavior: no subcommand → show help + recent sessions
// Unknown args → treat as natural language search
const known = ["list", "search", "new", "ls", "attach", "kill", "resume", "config", "help"];
const args = process.argv.slice(2);

if (args.length === 0) {
  // Show help + last 5 sessions
  program.outputHelp();
  console.log("\nRecent sessions:");
  const recent = loadSessions(5);
  if (recent.length) {
    console.log(formatSessionTable(recent));
  } else {
    console.log("  No history found.");
  }
} else if (args.length > 0 && !known.includes(args[0]) && !args[0].startsWith("-")) {
  // Natural language search
  defaultCommand(args.join(" "));
} else {
  program.parse();
}
```

- [ ] **Step 11: Build and test**

```bash
npm run build
node dist/cli.js --help
node dist/cli.js list -n 5
```

- [ ] **Step 12: Commit**

```bash
git add src/commands/ src/cli.ts
git commit -m "feat: all CLI commands wired up — list, search, new, ls, attach, kill, resume, config, AI default"
```

---

### Task 11: Build, Link, and End-to-End Test

**Files:**
- Modify: `bin/ch.js`
- Modify: `package.json` (if needed)

- [ ] **Step 1: Update bin/ch.js for ESM**

```javascript
#!/usr/bin/env node
await import("../dist/cli.js");
```

- [ ] **Step 2: Make bin executable**

```bash
chmod +x bin/ch.js
```

- [ ] **Step 3: npm link for local testing**

```bash
cd /home/user/projects/cch
npm run build
npm link
```

- [ ] **Step 4: Test all commands**

```bash
ch --help
ch list -n 10
ch ls
ch config
ch search Zellij
ch 上次那个iOS调试的对话
```

Verify each produces expected output.

- [ ] **Step 5: Test new session creation**

```bash
cd /home/user/projects
ch new "test session"
# Should open Zellij/tmux with Claude
# Exit with Ctrl+q or Ctrl+d
ch ls
# Should show ch-myproject-<hash> with description
```

- [ ] **Step 6: Commit**

```bash
git add bin/ package.json
git commit -m "feat: build and link — ch command ready for use"
```

---

### Task 12: Update .zshrc Aliases

**Files:**
- Modify: `/home/user/.zshrc`

- [ ] **Step 1: Replace old aliases and functions with ch**

In `~/.zshrc`, replace the entire Claude Code shortcut block (from `# Claude Code shortcut` through the `cls()` function) with:

```bash
# Claude Code shortcuts
alias claude-skip='zellij --config ~/.config/zellij/claude-skip.kdl'
alias claude-tg="claude --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official"

# cch — Claude Code History (npm install -g cch)
alias cn="ch new"
alias cnf="ch new -f"
alias cls="ch ls"
alias chs="ch search"
```

- [ ] **Step 2: Remove old claude-history script**

```bash
rm /home/user/.local/bin/claude-history
```

- [ ] **Step 3: Source and verify**

```bash
source ~/.zshrc
cn "test from alias"
cls
ch list
ch 上次帮我部署虾的
```

- [ ] **Step 4: Commit zshrc is user's own file — skip commit, just verify**

No git commit for .zshrc changes.
