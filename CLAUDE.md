# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

A CLI tool (`ch` command) that manages Claude Code conversation history across all your projects. Natural language search, session management, Zellij/tmux integration.

## Development commands

```bash
npm run build       # esbuild → dist/cli.js (bundle entry point)
npm run dev         # tsx watch mode (recompiles on save)
npm run typecheck   # tsc --noEmit
npm test            # node --test (runs compiled test files)
```

To test locally after changes:

```bash
npm run build && ch ls   # rebuilds then runs
```

Or use dev mode and test directly via `tsx`:

```bash
npx tsx src/cli.ts ls
```

## Architecture

### Layers

```
src/cli.ts              ← Commander.js entry; routes args to command handlers
src/commands/           ← One file per subcommand (ls, ps, new, search, …)
src/services/           ← Business logic: history.ts, session.ts, ai-search.ts
src/backends/           ← Terminal multiplexer abstraction (Zellij / tmux)
src/config/index.ts     ← Config loading + runtime caching (~/.config/cch/)
src/utils/jsonl.ts      ← Claude session .jsonl file parsing
src/ui/                 ← colors.ts, format.ts, select.ts (interactive picker)
```

### Data flow

1. User runs `ch <args>` → `bin/ch.js` imports `dist/cli.js`
2. `cli.ts` registers commands with Commander; unknown args → `defaultCommand` (AI search)
3. Commands call `services/history.ts` to load sessions from `~/.claude/projects/**/*.jsonl`
4. Sessions rendered via `ui/format.ts` → interactive picker in `ui/select.ts`
5. On selection → `services/session.ts` calls the active backend to attach/create

### Session file parsing (`utils/jsonl.ts`)

Claude stores conversations as JSONL under `~/.claude/projects/<encoded-path>/<session-id>.jsonl`. The parser:
- Two-phase scan: gather file metadata first, then parse only top N by mtime
- Reads first 32KB (messages) + last 2MB (custom title entries) for efficiency
- Results cached in `~/.config/cch/cache.json` keyed by `filePath + mtime`

Key type: `SessionInfo` — sessionId, filePath, project, cwd, gitBranch, timestamp, firstMsg, userMsgs[]

### Backends (`src/backends/`)

Abstract interface `SessionBackend` with: `isAvailable()`, `listSessions()`, `createSession()`, `attachSession()`, `killSession()`.

- **Zellij**: generates KDL layout + config files in `/tmp/cch-zellij/`
- **tmux**: uses `new-session` + `send-keys`
- **detect.ts**: reads config `backend` field; falls back to auto-detection (zellij → tmux)

### AI search (`services/ai-search.ts`)

1. If `claude-mem` CLI is installed: query via `mem-search` skill, map observation IDs → session IDs
2. Fallback: pass numbered session list to Claude haiku via SDK, parse JSON indices response

### Interactive picker (`ui/select.ts`)

Built on `@clack/core` SelectPrompt. Keybindings: `j/k` vim movement, `1-9` jump, `dd` delete (ps command only), `q` cancel. CJK double-width character support throughout.

### Session naming

```
ch-{dirname}[-{description}][-{hash}]
```

Description sanitized to alphanumeric/dash/underscore (max 30 chars). Non-ASCII-only descriptions use MD5 hash suffix.

### Config files at `~/.config/cch/`

- `config.json` — user settings (`backend`, `claudeCommand`, `claudeArgs`, `historyLimit`, `excludeDirs`)
- `sessions.json` — active session metadata (name → {desc, cwd, createdAt})
- `cache.json` — parsed session cache (perf optimization)

## Install / setup (when user asks)

### Prerequisites

```bash
node --version    # Must be >= 18
which claude      # Claude Code CLI must be installed
which zellij || which tmux   # At least one multiplexer
```

### From this repo

```bash
npm install && npm run build && npm link
ch setup          # installs shell aliases (cn, cnf, cls, cps, chs)
source ~/.zshrc
ch --version && ch ls
```

### From npm

```bash
npm install -g cch
ch setup
source ~/.zshrc
```

## Quick command reference

| Command | Alias | Description |
|---------|-------|-------------|
| `ch <natural language>` | — | AI search past conversations |
| `ch ls [-n 20]` | `cls` | Browse conversation history, pick to resume |
| `ch ps` | `cps` | View active multiplexer sessions, pick to attach |
| `ch new [description]` | `cn` | New Claude session in current directory |
| `ch new -f [description]` | `cnf` | Force new (kill old first) |
| `ch search <keyword>` | `chs` | Exact keyword search |
| `ch attach <name>` | — | Attach to active session |
| `ch kill <name>` | — | Kill a session |
| `ch resume <id>` | — | Resume by session ID |
| `ch config [key] [value]` | — | Show/set configuration |
| `ch setup` | — | Install shell aliases + tmux config |
