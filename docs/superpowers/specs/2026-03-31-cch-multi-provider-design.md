# CCH Multi-Provider History Design

Extend `cch` from a Claude-only history tool into a provider-aware history manager that supports both Claude Code and Codex while preserving the current Claude-first defaults and the existing bare `ch <description>` natural-language search flow.

## Motivation

`cch` 0.2.1 still hardcodes Claude in its history scanning, new-session launch, and resume logic. That makes sense for the original tool, but it blocks a practical workflow where users want one tmux/zellij-backed history manager that can:

- keep Claude as the default provider
- explicitly launch Codex when needed
- browse or search Codex history on demand
- resume either provider directly from the same selection flow

The goal is additive Codex support, not a fully dynamic provider plugin system.

## Current-State Notes

The repository already contains earlier design docs for the initial Claude-only tool. Those documents predate some of the behavior now present in `0.2.1`, especially:

- bare `ch <description>` as the default AI-search entrypoint
- current `ls` / `ps` command naming
- current config defaults

This design intentionally targets the current codebase and current CLI surface.

## User-Facing Behavior

### Defaults

- `ch <description>` remains the natural-language AI search entrypoint
- bare `ch <description>` searches Claude only
- `ch search <keyword>` remains the exact keyword search entrypoint
- `ch ls` remains the recent-history browser
- `ch new` remains Claude by default

### Provider Selection

Supported provider values:

- `claude`
- `codex`
- `all`

Provider behavior:

- `ch new [description]` launches a new Claude session
- `ch new --provider codex [description]` launches a new Codex session
- `ch ls` shows Claude history only
- `ch ls --provider codex` shows Codex history only
- `ch ls --provider all` shows merged Claude and Codex history
- `ch search <keyword>` searches Claude only
- `ch search <keyword> --provider all` searches merged history
- `ch --provider codex <description>` runs AI search over Codex sessions only
- `ch --provider all <description>` runs AI search over merged history
- `ch resume <sessionId>` searches all providers by default and resumes the unique matching session
- `ch resume <sessionId> --provider codex` limits lookup to Codex

### No-Result Messaging

When a Claude-default command finds nothing, suggest widening the scope:

- `ch search <keyword>`: `No sessions found in claude. Try --provider all.`
- `ch <description>`: `No matching sessions in claude. Try --provider all.`

### Conflict Handling

If `ch resume <sessionId>` finds the same ID in multiple providers:

- do not guess
- show a conflict error
- tell the user to rerun with `--provider claude` or `--provider codex`

## Architecture

Introduce a small provider abstraction rather than scattering provider-specific branches across commands.

### Unified Session Shape

All history-oriented commands operate on a single normalized shape:

```ts
type ProviderName = "claude" | "codex";

type HistorySession = {
  provider: ProviderName;
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  mtime: number;
  sourcePath: string;
  title?: string;
};
```

This lets `ls`, keyword search, AI search, and `resume` work over one merged list.

### Provider Interface

Each provider implements:

```ts
type Provider = {
  name: ProviderName;
  scanSessions(limit?: number): HistorySession[];
  buildNewInvocation(description?: string): { command: string; args: string[] };
  buildResumeInvocation(sessionId: string): { command: string; args: string[] };
};
```

The command layer should never directly know where Claude or Codex stores history.

### Provider Resolution

Add a helper that resolves command scope:

- `claude` -> Claude provider only
- `codex` -> Codex provider only
- `all` -> merge providers and sort by most recent first

Commands then become simple:

- `ls/search` decide which provider set to load
- bare `ch` builds an AI prompt from that provider-filtered session list
- `resume` resolves the matching `HistorySession`, then dispatches to that session's provider

## Claude Provider

Claude behavior stays functionally unchanged.

### Data Source

- primary source: `~/.claude/projects/**/*.jsonl`
- existing parsing logic remains valid

### Invocation Rules

- new session: configured Claude command plus configured Claude args
- resume: configured Claude command plus configured Claude args plus `--resume <sessionId>`

## Codex Provider

Codex support should be good enough to show project, branch, and first user message, not just thread title.

### Primary Data Source

Use `~/.codex/state_5.sqlite` as the main history source.

The `threads` table already contains the fields needed for parity with Claude-style display:

- `id`
- `cwd`
- `git_branch`
- `title`
- `first_user_message`
- `updated_at`
- `archived`
- `model_provider`

Mapping:

- `sessionId` <- `id`
- `cwd` <- `cwd`
- `gitBranch` <- `git_branch || ""`
- `timestamp` <- converted `updated_at`
- `firstMsg` <- `first_user_message`, fallback to `title`
- `userMsgs` <- `[first_user_message]` when available
- `mtime` <- numeric `updated_at`
- `sourcePath` <- `~/.codex/state_5.sqlite`

### Fallback Data Source

Use `~/.codex/session_index.jsonl` only as a fallback when SQLite is unavailable or unreadable.

This fallback provides:

- `id`
- `thread_name`
- `updated_at`

Fallback mapping:

- `firstMsg` <- `thread_name`
- `cwd` <- `""`
- `gitBranch` <- `""`

### Invocation Rules

- new session: configured Codex command plus configured Codex args
- resume: configured Codex command plus configured Codex args plus `resume <sessionId>`

The user never runs `codex resume` manually. `cch` performs that step after the user selects a result.

## CLI Changes

### New Options

Add `--provider <provider>` to:

- bare `ch <description>` handling
- `ch ls`
- `ch search`
- `ch new`
- `ch resume`

Provider defaults:

- bare `ch`: `claude`
- `ls`: `claude`
- `search`: `claude`
- `new`: `claude`
- `resume`: `all`

### Bare `ch` Handling

Keep the current "non-command args mean AI search" behavior, but parse an optional leading `--provider`.

Examples:

- `ch login bug`
- `ch --provider codex login bug`
- `ch --provider all login bug`

No `find` subcommand is required. Bare `ch` remains the abstraction for natural-language search.

### Display in `all` Mode

When displaying merged results, prefix each row with a short provider marker:

- `[cl]` for Claude
- `[cx]` for Codex

Examples:

- `ch ls --provider all`
- `ch search auth --provider all`
- `ch --provider all "the one about cmux and resume"`

Provider markers should also be included in the AI-search table so the model can reason about mixed results.

## Configuration

Keep backward compatibility with existing Claude config keys.

### Existing Keys

- `backend`
- `claudeCommand`
- `claudeArgs`
- `historyLimit`

### New Keys

- `codexCommand` default: `"codex"`
- `codexArgs` default: `["--no-alt-screen"]`
- `defaultProvider` default: `"claude"`

No generalized `providers.{name}` config structure is needed in this version.

## Caching

The current cache is Claude-specific. Codex support should not require a risky full rewrite.

### First-Version Cache Strategy

- keep existing Claude cache behavior
- add provider-aware cache entries for Codex
- store provider metadata in cache rows

Suggested cache fields:

- `provider`
- `sourceKey`
- `mtime` or `updatedAt`
- normalized session payload

Recommended implementation:

- either add a `provider` field to the current cache file
- or keep a separate Codex namespace inside the same JSON file

Avoid a large cache migration in the same change as provider support.

## Search Behavior

### Keyword Search

Keyword search stays deterministic:

- filter the provider-scoped session list
- search `firstMsg`, `userMsgs`, and any already-loaded summary fields

### AI Search

Bare `ch <description>` continues to use Claude for ranking, even when the session set contains Codex results.

This means:

- provider scope determines the candidate sessions
- Claude remains the ranking engine for natural-language matching
- returned indices map back to `HistorySession` entries
- selected sessions resume using the chosen session's provider

This keeps the current mental model intact while extending the search corpus.

## Session Naming in tmux/zellij

Multiplexer session naming can retain the existing `ch-...` prefix.

Recommended adjustment:

- include provider in the generated name for new or resumed sessions when not Claude

Examples:

- Claude: `ch-myproject-fix-auth`
- Codex: `ch-cx-myproject-fix-auth`
- Resumed Codex: `ch-cx-myproject-019d3f0b`

This avoids collisions and makes live sessions easier to identify in `ch ps`.

## Error Handling

### Missing Provider Binary

If the selected provider command is unavailable:

- show a provider-specific error
- do not silently fall back to another provider

### Missing Codex State Database

If `state_5.sqlite` is unreadable:

- try `session_index.jsonl`
- if both fail, show a clear Codex-history-unavailable message

### Invalid Resume Target

If a session was found in history but resume fails:

- print the provider and session id in the error
- leave the multiplexer state untouched if possible

## Testing

### Unit Tests

- Claude provider parsing still works with existing JSONL samples
- Codex provider maps SQLite rows into normalized sessions
- Codex fallback parser maps `session_index.jsonl` into normalized sessions
- provider resolution merges and sorts correctly
- `resume` conflict detection works
- bare `ch` argument parsing accepts optional `--provider`

### Integration Tests

- `ch new` launches Claude by default
- `ch new --provider codex` launches Codex
- `ch ls --provider all` shows both providers with markers
- `ch search` default miss suggests `--provider all`
- bare `ch --provider all <description>` builds a mixed AI-search table
- selecting a Codex result resumes through `codex resume <id>`

### Manual Verification

On a machine with both tools installed:

- verify Claude defaults remain unchanged
- verify Codex history includes project, branch, and first user message
- verify mixed search and mixed resume
- verify tmux/zellij attach behavior still works

## Out of Scope

- arbitrary third-party provider plugins
- a fully dynamic provider registry
- deep Codex log ingestion from `logs_1.sqlite`
- unifying Claude and Codex auth or runtime settings
- replacing Claude as the AI ranking engine for natural-language search

## Rollout Notes

This change should be implemented in one compatibility-focused pass:

1. add provider-aware parsing and normalized session shape
2. wire provider selection into `new`, `ls`, `search`, bare `ch`, and `resume`
3. add Codex SQLite support with JSONL fallback
4. update prompts, messages, and help text
5. add tests for both providers and mixed mode

Success means a Claude-first user can upgrade without changing habits, while an explicit Codex user can browse, search, and resume Codex sessions from the same tool.
