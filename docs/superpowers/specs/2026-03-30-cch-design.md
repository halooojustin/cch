# CCH - Claude Code History

A CLI tool for managing Claude Code conversation history across multiple projects, with AI-powered natural language search and terminal multiplexer session management.

## Problem

Claude Code stores conversation history in `~/.claude/projects/<encoded-path>/*.jsonl`, scoped to each project directory. When working across many repos:

- `claude --resume` only shows history for the current directory
- No way to search across all projects for a past conversation
- Closing a terminal loses the active session
- No global view of what Claude sessions are running

## Solution

`ch` is a single CLI command that provides:

1. **Natural language history search** — describe what you remember, AI finds the session
2. **Two-level resume** — attach to live multiplexer sessions, or resurrect from .jsonl history
3. **Session lifecycle** — create, list, kill Claude sessions inside Zellij or tmux
4. **Global dashboard** — see all active Claude sessions with descriptions

## Commands

```
ch                          Show help + last 5 sessions
ch <natural language>       AI search history, resume in multiplexer
ch list [-n 20]             List recent sessions from .jsonl history
ch search <keyword>         Exact keyword search in .jsonl content
ch new [description]        New Claude session in current dir (multiplexer)
ch new! [description]       Force new (kill existing same-name session first)
ch ls                       List active multiplexer sessions
ch attach <session-name>    Attach to a live multiplexer session
ch kill <session-name>      Kill a multiplexer session
ch resume <session-id>      Resume by session ID in multiplexer
ch config                   Show current config
ch config set <key> <value> Set config value
```

## Architecture

```
CLI Layer (Commander.js)
    │
    ├── History Service
    │   ├── Scanner — reads ~/.claude/projects/**/*.jsonl
    │   ├── Parser — extracts session metadata + first user messages
    │   ├── Cache — ~/.config/cch/cache.json (keyed by file path + mtime)
    │   └── AI Search — pipes session list to `claude -p` for matching
    │
    └── Session Service
        ├── SessionBackend interface
        ├── Zellij backend
        ├── tmux backend
        └── Auto-detect (Zellij → tmux → error)
```

### SessionBackend Interface

```typescript
interface SessionBackend {
  name: string;
  isAvailable(): Promise<boolean>;
  listSessions(): Promise<ActiveSession[]>;
  createSession(opts: CreateSessionOpts): Promise<void>;
  attachSession(name: string): Promise<void>;
  killSession(name: string): Promise<void>;
}

interface ActiveSession {
  name: string;
  created: string;
  status: "running" | "exited";
}

interface CreateSessionOpts {
  name: string;
  command: string;
  args: string[];
  cwd: string;
}
```

### Zellij Backend

Creates sessions via temporary KDL config files:
- Generates layout file with `pane command="claude" cwd="..." { args "..." }`
- Generates config file with `session_name`, `attach_to_session true`, `default_layout`
- Runs `zellij --config <tmp-config>`
- Lists sessions via `zellij ls`, parses output (strips ANSI codes)
- Kills via `zellij kill-session <name>`

### tmux Backend

- Creates sessions via `tmux new-session -d -s <name> -c <cwd> '<command>'` then `tmux attach`
- Lists via `tmux list-sessions`
- Attaches via `tmux attach -t <name>`
- Kills via `tmux kill-session -t <name>`

### Backend Detection

Priority: Zellij → tmux. Check with `which`. User can override via `ch config set backend tmux`.

## History Service

### .jsonl Scanning

Location: `~/.claude/projects/`

Each subdirectory name is an encoded project path (`-Users-weller-myproject` → `/home/user/projects`).

For each `*.jsonl` file (skip `*/subagents/*`):
- Read first 50 lines
- Extract: `sessionId`, `cwd`, `gitBranch`, `timestamp`
- Collect first 5 `type: "user"` messages (strip `<system-reminder>` tags)
- Use file mtime as sort key

### Cache

```json
// ~/.config/cch/cache.json
{
  "/path/to/session.jsonl": {
    "mtime": 1711800000,
    "sessionId": "abc-123",
    "cwd": "/home/user/projects",
    "gitBranch": "main",
    "timestamp": "2026-03-29T14:54:00Z",
    "firstMsg": "我想要用上 Zellij",
    "userMsgs": ["我想要用上 Zellij", "要的", "帮我改一下..."]
  }
}
```

On scan: if file path exists in cache and mtime matches, skip parsing. Otherwise re-parse and update cache.

### AI Search

1. Load up to 100 recent sessions (cached)
2. Build text table: `#N  timestamp  project  [branch]  first-message  more-messages`
3. Call `claude -p` with prompt asking to return matching session numbers
4. Parse response, display matches, prompt user to select

Prompt template:
```
你是一个会话历史搜索助手。用户想找到之前的某个 Claude Code 对话。

以下是所有会话列表（按时间倒序）：
{table}

用户的描述："{query}"

请从列表中找出最匹配的 1-3 个会话。只返回编号，用逗号分隔。
如果没有匹配的，返回 "0"。
```

## Session Metadata

```json
// ~/.config/cch/sessions.json
{
  "cn-myproject-a3b2c1": {
    "description": "写个cc history插件",
    "cwd": "/home/user/projects",
    "createdAt": "2026-03-30T01:00:00Z"
  }
}
```

Persists session descriptions across reboots (replaces /tmp approach).

## Configuration

```json
// ~/.config/cch/config.json
{
  "backend": "auto",
  "claudeCommand": "claude",
  "claudeArgs": ["--dangerously-skip-permissions"],
  "historyLimit": 100
}
```

- `backend`: `"auto"` | `"zellij"` | `"tmux"`
- `claudeCommand`: path to claude CLI
- `claudeArgs`: default args when creating new sessions
- `historyLimit`: max sessions to load for AI search

## Session Naming

Format: `ch-<dirname>[-<hash>]`

- `ch new` in `/home/user/projects` → session name `ch-myproject`
- `ch new 修复登录bug` → `ch-myproject-<md5-6chars>`, description stored in sessions.json
- `ch resume <id>` → `ch-<dirname>-<id-first-8>`

Prefix `ch-` makes sessions identifiable in `zellij ls` / `tmux ls`.

## Display

### `ch ls` output

```
Active Claude Sessions:
──────────────────────────────────────────────────
  ch-myproject-a3b2c1   5m ago    myproject    写个cc history插件
  ch-demo           30m ago   donut
  ch-myproject          1h ago    myproject

Other Sessions:
──────────────────────────────────────────────────
  stellar-clarinet   2h ago
```

### `ch list` output

```
 #  Time              Project                  Branch     First Message
───────────────────────────────────────────────────────────────────────
 1  03-29 14:54       ~/projects                 HEAD       我想要用上 Zellij
 2  03-29 04:43       ~/mumian/openclaw         main       帮我开2个子Agent部署2只虾
 3  03-28 17:32       ~/projects/kingyo/JinYun    dev        我现在正在用 xcode 调试开发
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| CLI framework | Commander.js |
| Language | TypeScript |
| Build | esbuild (single-file bundle) |
| Runtime | Node.js >= 18 |
| Runtime deps | commander (only) |
| Dev deps | typescript, esbuild, tsx |

## Distribution

```json
{
  "name": "cch",
  "bin": { "ch": "./bin/ch.js" }
}
```

```bash
npm install -g cch   # global install
npx cch              # or via npx
ch list              # available after install
```

## Project Structure

```
cch/
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── default.ts        # ch <natural language>
│   │   ├── list.ts           # ch list
│   │   ├── search.ts         # ch search
│   │   ├── new.ts            # ch new / ch new!
│   │   ├── ls.ts             # ch ls
│   │   ├── attach.ts         # ch attach
│   │   ├── kill.ts           # ch kill
│   │   ├── resume.ts         # ch resume
│   │   └── config.ts         # ch config
│   ├── services/
│   │   ├── history.ts
│   │   ├── ai-search.ts
│   │   └── session.ts
│   ├── backends/
│   │   ├── interface.ts
│   │   ├── zellij.ts
│   │   ├── tmux.ts
│   │   └── detect.ts
│   ├── config/
│   │   └── index.ts
│   └── utils/
│       ├── jsonl.ts
│       └── display.ts
├── bin/
│   └── ch.js
├── package.json
├── tsconfig.json
├── esbuild.config.ts
└── README.md
```

## Error Handling

- No multiplexer installed → clear error: "Please install Zellij or tmux"
- No `claude` CLI → error on AI search only, other commands still work
- Empty history → "No Claude Code history found in ~/.claude/projects/"
- AI search returns no match → "No matching sessions. Try `ch list` to browse all."
- Session name conflict → append incremental suffix

## Testing Strategy

- Unit tests for jsonl parser, cache logic, path encoding/decoding
- Integration tests for backend implementations (mock shell commands)
- Manual testing for TUI interactions (multiplexer attach/create)
