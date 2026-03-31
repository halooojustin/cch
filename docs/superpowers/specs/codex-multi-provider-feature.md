# Codex Multi-Provider Support

This document describes the new features added in the `feat/codex-multi-provider-design` branch relative to the original Claude-only `cch` tool.

## Summary

The original `cch` tool only supported Claude Code history. This branch extends it into a dual-provider history manager that supports both **Claude Code** and **Codex**, while keeping Claude as the default and preserving all existing behavior.

---

## New Features

### 1. Codex History Provider

All history commands now work with Codex sessions.

**Primary source:** `~/.codex/state_5.sqlite` (`threads` table)  
**Fallback source:** `~/.codex/session_index.jsonl`

Codex sessions are normalized into the same shape as Claude sessions, enabling unified browsing, search, and resume flows.

### 2. `--provider` Flag on All History Commands

Every history-facing command now accepts `--provider <claude|codex|all>`:

| Command | Default | Accepts |
|---|---|---|
| `ch <query>` | `claude` | `claude`, `codex`, `all` |
| `ch ls` | `claude` | `claude`, `codex`, `all` |
| `ch search <keyword>` | `claude` | `claude`, `codex`, `all` |
| `ch new` | `claude` | `claude`, `codex` |
| `ch resume <id>` | `all` | `claude`, `codex`, `all` |

**Examples:**

```bash
ch ls --provider codex
ch ls --provider all
ch search auth --provider all
ch --provider codex the one about cmux resume
ch new --provider codex
ch resume <id> --provider codex
```

### 3. Bare `ch --provider <p> <query>` Syntax

The natural-language search entrypoint now accepts an optional leading `--provider` flag:

```bash
ch the iOS debugging session             # searches Claude (default)
ch --provider codex the cmux session    # searches Codex only
ch --provider all the auth refactor     # searches both providers
```

If `--provider` is given without a query, it falls back to showing the history list for that provider:

```bash
ch --provider codex    # equivalent to ch ls --provider codex
```

### 4. Codex Subagent Filtering

Codex stores subagent threads (worker, explorer, reviewer) alongside user-initiated threads in the same database. By default, `cch` hides these using four-signal exclusion:

- `agent_role IS NOT NULL` — worker / explorer / default (reviewer) roles
- `agent_nickname IS NOT NULL` — named subagents (e.g. Anscombe, Boole)
- `source` contains `{"subagent":` — spawn-sourced threads
- `id` in `thread_spawn_edges.child_thread_id` — threads with a parent

**Result:** 46 clean user-initiated sessions out of 103 total (on a typical active Codex install).

Use `--show-subagents` to reveal hidden threads:

```bash
ch ls --provider codex --show-subagents
ch ls --provider all --show-subagents
```

### 5. Mixed-Provider Display Markers

In `--provider all` mode, each row is prefixed with a short provider marker:

- `[cl]` — Claude Code session
- `[cx]` — Codex session

When `--show-subagents` is also active, subagent rows include an additional role marker:

- `[cx][worker]`, `[cx][explorer]`, `[cx][default]`

### 6. Provider-Aware Session Naming

Sessions created via `ch new` are named differently per provider to avoid collisions:

- Claude: `ch-<project>-<desc>`
- Codex: `ch-cx-<project>-<desc>`
- Claude resume: `ch-<project>-<sessionId[:8]>`
- Codex resume: `ch-cx-<project>-<sessionId[:8]>`

### 7. Resume Conflict Detection

`ch resume <id>` searches all providers by default. If the same session ID appears in both Claude and Codex (unlikely but possible), `cch` refuses to guess and asks you to narrow with `--provider`:

```
Session ID conflict: <id>
Rerun with --provider claude or --provider codex.
```

### 8. New Config Keys

Two new keys in `~/.config/cch/config.json`:

| Key | Default | Description |
|---|---|---|
| `codexCommand` | `"codex"` | Codex binary to invoke |
| `codexArgs` | `["--no-alt-screen"]` | Default args for Codex |
| `defaultProvider` | `"claude"` | Default provider for bare `ch` and `ch ls` |

Existing Claude config keys (`claudeCommand`, `claudeArgs`, etc.) are unchanged.

### 9. Claude-Mem Search Preserved

When `claude-mem` is installed and `--provider claude` (or default) is active, semantic memory search is used first. The fix also preserves the relevance order of observation IDs when resolving them back to session IDs.

---

## Unchanged Behavior

The following behaviors are identical to the original tool:

- `ch <query>` without `--provider` searches Claude only
- `ch ls` without `--provider` shows Claude history only
- `ch new` without `--provider` creates a Claude session
- `ch ps` lists all active multiplexer sessions (provider-agnostic)
- All shell aliases (`cn`, `cnf`, `cls`, `cps`, `chs`) work as before
- Claude JSONL parsing and caching logic is intact

---

## Test Coverage Added

- Provider-aware bare query parsing
- Config defaults for new Codex keys
- Codex SQLite / JSONL mapping
- Subagent filter SQL with and without `--show-subagents`
- Agent-role normalization
- Provider-aware history merge, cache reuse, malformed-cache reparsing
- Mixed-provider display markers
- Claude-mem relevance-order preservation
- Provider-aware session naming
