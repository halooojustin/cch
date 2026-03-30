# CCH — Claude Code History

## What is this?

A CLI tool (`ch` command) that manages Claude Code conversation history across all your projects. Natural language search, session management, Zellij/tmux integration.

## Install for the user

When the user asks you to install or set up CCH, follow these steps:

### Step 1: Check prerequisites

```bash
node --version    # Must be >= 18
which claude      # Claude Code CLI must be installed
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
| `ch <natural language>` | — | AI search past conversations |
| `ch ls [-n 20]` | `cls` | Browse conversation history, pick to resume |
| `ch ps` | `cps` | View active multiplexer sessions, pick to attach |
| `ch new [description]` | `cn` | New Claude session in current directory |
| `ch new -f [description]` | `cnf` | Force new (kill old first) |
| `ch search <keyword>` | `chs` | Exact keyword search |
| `ch attach <name>` | — | Attach to active session |
| `ch kill <name>` | — | Kill a session |
| `ch resume <id>` | — | Resume by session ID |
| `ch config` | — | Show/set configuration |
| `ch setup` | — | Install shell aliases |

## Configuration

Config at `~/.config/cch/config.json`:

- `backend`: `"auto"` (default), `"zellij"`, or `"tmux"`
- `claudeCommand`: `"claude"` (default)
- `claudeArgs`: `["--dangerously-skip-permissions"]` (default)
- `historyLimit`: `100` (default)

## Development

```bash
npm install
npm run build       # esbuild → dist/cli.js
npm run dev         # tsx watch mode
npm run typecheck   # tsc --noEmit
```
