# CCH — Claude / Codex History

## What is this?

A CLI tool (`ch` command) that manages Claude Code and Codex conversation history across all your projects. Natural language search, history browsing, session management, Zellij/tmux integration.

## Install for the user

When the user asks you to install or set up CCH, follow these steps:

### Step 1: Check prerequisites

```bash
node --version    # Must be >= 18
which claude      # Claude Code CLI must be installed
which codex || true
which zellij || which tmux   # At least one multiplexer
```

If Zellij is not installed: `brew install zellij`

### Step 2: Install globally

```bash
npm install -g cch
```

Or if working from this repo:

```bash
cd <this-repo-directory>
npm install
npm run build
npm link
```

### Step 3: Set up shell aliases

```bash
ch setup
```

This automatically adds the following aliases to the user's `.zshrc` or `.bashrc`:

- `cn` → `ch new` (new session)
- `cnf` → `ch new -f` (force new session)
- `cls` → `ch ls` (browse history)
- `cps` → `ch ps` (active sessions)
- `chs` → `ch search` (keyword search)

### Step 4: Reload shell

```bash
source ~/.zshrc
```

### Step 5: Verify

```bash
ch --version
ch ls
```

## Quick reference

| Command | Alias | Description |
|---------|-------|-------------|
| `ch <natural language>` | — | AI search Claude history by default |
| `ch --provider codex <natural language>` | — | AI search Codex history |
| `ch --provider all <natural language>` | — | AI search merged history |
| `ch ls [-n 20] [--provider <p>]` | `cls` | Browse history, pick to resume |
| `ch ps` | `cps` | View active multiplexer sessions, pick to attach |
| `ch new [description] [--provider <p>]` | `cn` | New Claude or Codex session |
| `ch new -f [description] [--provider <p>]` | `cnf` | Force new (kill old first) |
| `ch search <keyword> [--provider <p>]` | `chs` | Exact keyword search |
| `ch attach <name>` | — | Attach to active multiplexer session |
| `ch kill <name>` | — | Kill a multiplexer session |
| `ch resume <id> [--provider <p>]` | — | Resume by session ID |
| `ch config` | — | Show/set configuration |
| `ch setup` | — | Install shell aliases |

## Configuration

Config at `~/.config/cch/config.json`:

- `backend`: `"auto"` (default), `"zellij"`, or `"tmux"`
- `claudeCommand`: `"claude"` (default)
- `claudeArgs`: `["--dangerously-skip-permissions"]` (default)
- `codexCommand`: `"codex"` (default)
- `codexArgs`: `["--no-alt-screen"]` (default)
- `defaultProvider`: `"claude"` (default)
- `historyLimit`: `100` (default)
- `excludeDirs`: `["claude-mem"]` (default)

## Development

```bash
npm install
npm run build       # esbuild → dist/cli.js
npm run dev         # tsx watch mode
npm run typecheck   # tsc --noEmit
npm test            # TypeScript tests via tsx
```

Local smoke checks:

```bash
node dist/cli.js --help
node dist/cli.js ls --provider claude
node dist/cli.js ls --provider codex
node dist/cli.js ls --provider all
```
