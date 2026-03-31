# cch — Claude / Codex Conversation History

AI-powered conversation history management for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and Codex.

Find past conversations with natural language, browse history across projects, and resume them in Zellij or tmux.

## The Problem

Claude Code stores conversation history in `~/.claude/projects/`, scoped per directory. When you work across many repos:

- `claude --resume` only shows history for the **current** directory
- No way to search across all projects for a past conversation
- Closing a terminal loses the active session
- No global view of running Claude sessions

## Install

```bash
npm install -g @halooojustin/cch
ch setup          # adds shell aliases (cn, cnf, cls, cps, chs)
source ~/.zshrc   # or open a new terminal
```

### Claude Code Skill (optional)

Install the skill so Claude Code knows how to use `ch` for you:

```bash
cp -r $(npm root -g)/cch/skill ~/.claude/skills/cch
```

Then you can just tell Claude Code things like "find my iOS debugging conversation" and it will use `ch` automatically.

**Requirements:**
- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- [Zellij](https://zellij.dev/) or [tmux](https://github.com/tmux/tmux) (at least one)

## Usage

### Natural Language Search

Just describe what you remember. AI finds the session.

```bash
ch the iOS debugging session
ch the one where I was deploying openclaw
ch the wallet refactor last week
ch --provider codex the one about cmux resume
ch --provider all the session about auth redirects
```

For Claude scope, `ch` can use `claude-mem` semantic search when available, then fall back to Claude CLI ranking. Codex and mixed-provider search use the provider-aware session table.

### Commands

```bash
ch <description>                           Natural language search (Claude by default)
ch --provider codex <description>          Natural language search in Codex history
ch --provider all <description>            Natural language search across Claude + Codex
ch ls [-n 20] [--provider <p>]             Browse history, pick to resume
ch search <keyword> [--provider <p>]       Exact keyword search
ch new [description] [--provider <p>]      New Claude or Codex session
ch new -f [description] [--provider <p>]   Force new (kill old first)
ch ps                                      List active multiplexer sessions
ch attach <name>                           Attach to a live session
ch kill <name>                             Kill a session
ch resume <session-id> [--provider <p>]    Resume by session ID
ch config                                  Show configuration
ch setup                                   Install shell aliases
```

Provider values:

- `claude`
- `codex`
- `all`

### Interactive Selection

`ch ls`, `ch search`, and natural-language search results all use an interactive selector:

- **Up/Down arrows** or **j/k** — navigate the list
- **Number keys** — type a number (e.g. `12`) then **Enter** to jump directly
- **Enter** — confirm selection (resume session or attach to live session)
- **Esc** or **q** — cancel

CJK text is properly aligned with display-width-aware column padding.

### Two-Level Resume

**Level 1 — Live sessions:** Session still running in your multiplexer?

```bash
ch ps                    # interactive list — pick one to attach
```

**Level 2 — History resume:** Session ended, but you want to pick it back up?

```bash
ch 那个讨论登录bug的对话     # AI finds it
# or
ch ls                       # interactive list — pick one to resume
ch ls --provider codex      # browse Codex history only
ch ls --provider all        # browse merged history
```

Both levels open in a Zellij/tmux session, so you can detach and reattach anytime. All sessions launch via login shell (`zsh -lc`) to inherit your full environment and auth.

### Session Management

```bash
# Start a new Claude session in current project
ch new

# Start a new Codex session
ch new --provider codex

# With a description (shows up in ch ls and as Zellij tab name)
ch new "fix authentication bug"
ch new 修复登录bug              # Chinese descriptions work too

# Force restart (kills existing session first)
ch new -f "start fresh on auth"

# See what's running in the multiplexer
ch ps

# Clean up
ch kill ch-myproject-fix-auth
```

### Session Descriptions

Descriptions you pass to `ch new` are used in multiple places:

- **Zellij tab name** — visible in the tab bar when inside the session (supports Chinese)
- **`ch ls` output** — shown next to the session name
- **Session name** — English descriptions are included in the session name (e.g. `ch-myproject-fix-login-bug`), Chinese descriptions use a hash fallback (e.g. `ch-myproject-a1b2c3`) since Zellij session names don't support CJK

## Configuration

Config lives at `~/.config/cch/config.json`:

```json
{
  "backend": "auto",
  "claudeCommand": "claude",
  "claudeArgs": ["--dangerously-skip-permissions"],
  "codexCommand": "codex",
  "codexArgs": ["--no-alt-screen"],
  "defaultProvider": "claude",
  "historyLimit": 100,
  "excludeDirs": ["claude-mem"]
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `backend` | `"auto"` | `"auto"`, `"zellij"`, or `"tmux"` |
| `claudeCommand` | `"claude"` | Path to Claude CLI |
| `claudeArgs` | `["--dangerously-skip-permissions"]` | Default args for new sessions and resumed sessions |
| `codexCommand` | `"codex"` | Path to Codex CLI |
| `codexArgs` | `["--no-alt-screen"]` | Default args for new/resumed Codex sessions |
| `defaultProvider` | `"claude"` | Stored default provider value |
| `historyLimit` | `100` | Max sessions loaded for AI search |
| `excludeDirs` | `["claude-mem"]` | Project directories skipped during Claude JSONL scanning |

```bash
ch config set backend tmux
ch config set historyLimit 200
ch config set codexArgs --no-alt-screen,--model,o3
```

## Recommended Aliases

Add to your `.zshrc` or `.bashrc`:

```bash
alias cn="ch new"
alias cnf="ch new -f"
alias cls="ch ls"
alias cps="ch ps"
alias chs="ch search"
```

Then use:

```bash
cn fix login bug        # new session with description
cn 修复登录bug           # Chinese descriptions supported
cnf                     # force restart current project session
cls                     # interactive history browser
cps                     # interactive active-session browser
chs 龙虾                # keyword search
```

## How It Works

1. **Provider-aware history** — Claude history comes from `~/.claude/projects/**/*.jsonl`; Codex history comes from `~/.codex/state_5.sqlite` with `session_index.jsonl` fallback. Both normalize into one in-memory `HistorySession` shape.

2. **Claude fast path** — For Claude-only natural-language search, `cch` uses `claude-mem` when available and falls back to Claude CLI ranking.

3. **Mixed-provider search** — For Codex and `all` scope, `cch` builds a provider-aware session table and uses Claude CLI ranking over the filtered candidates.

4. **Multiplexer integration** — New and resumed sessions launch into Zellij or tmux. Claude resumes use `--resume <id>`; Codex resumes use `resume <id>`.

5. **Session metadata and cache** — Session descriptions live in `~/.config/cch/sessions.json`; history cache lives in `~/.config/cch/cache.json`.

## Local Verification

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js --help
```

If you have both CLIs and local history available, smoke-check the provider paths:

```bash
node dist/cli.js ls --provider claude
node dist/cli.js ls --provider codex
node dist/cli.js ls --provider all
```

## License

MIT
