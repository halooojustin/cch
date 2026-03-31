import { parseJsonl, scanAllSessions, type SessionInfo } from "../utils/jsonl.js";
import { getCache, getConfig, writeCache } from "../config/index.js";
import type { HistorySession } from "./interface.js";
import type { SessionProvider } from "./interface.js";

interface ClaudeCacheEntry extends HistorySession {
  provider: "claude";
  sourcePath: string;
}

const CACHE_PREFIX = "claude:";

function normalizeSession(session: SessionInfo): HistorySession {
  return {
    provider: "claude",
    sessionId: session.sessionId,
    sourcePath: session.filePath,
    cwd: session.cwd,
    gitBranch: session.gitBranch,
    timestamp: session.timestamp,
    firstMsg: session.firstMsg,
    userMsgs: session.userMsgs,
    mtime: session.mtime,
  };
}

function getCacheKey(sourcePath: string): string {
  return `${CACHE_PREFIX}${sourcePath}`;
}

function isCachedSession(
  value: unknown,
  mtime: number,
): value is ClaudeCacheEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { mtime?: unknown }).mtime === mtime &&
      (value as { provider?: unknown }).provider === "claude" &&
      typeof (value as { sessionId?: unknown }).sessionId === "string" &&
      typeof (value as { sourcePath?: unknown }).sourcePath === "string" &&
      typeof (value as { cwd?: unknown }).cwd === "string" &&
      typeof (value as { gitBranch?: unknown }).gitBranch === "string" &&
      typeof (value as { timestamp?: unknown }).timestamp === "string" &&
      typeof (value as { firstMsg?: unknown }).firstMsg === "string" &&
      Array.isArray((value as { userMsgs?: unknown }).userMsgs),
  );
}

function readCachedSession(
  sourcePath: string,
  mtime: number,
  cache: Record<string, unknown>,
): ClaudeCacheEntry | null {
  const prefixed = cache[getCacheKey(sourcePath)];
  if (isCachedSession(prefixed, mtime)) return prefixed;

  const legacy = cache[sourcePath];
  if (
    legacy &&
    typeof legacy === "object" &&
    (legacy as { mtime?: unknown }).mtime === mtime &&
    typeof (legacy as { sessionId?: unknown }).sessionId === "string" &&
    typeof (legacy as { cwd?: unknown }).cwd === "string" &&
    typeof (legacy as { gitBranch?: unknown }).gitBranch === "string" &&
    typeof (legacy as { timestamp?: unknown }).timestamp === "string" &&
    typeof (legacy as { firstMsg?: unknown }).firstMsg === "string" &&
    Array.isArray((legacy as { userMsgs?: unknown }).userMsgs)
  ) {
    return {
      provider: "claude",
      sourcePath,
      sessionId: (legacy as { sessionId: string }).sessionId,
      cwd: (legacy as { cwd: string }).cwd,
      gitBranch: (legacy as { gitBranch: string }).gitBranch,
      timestamp: (legacy as { timestamp: string }).timestamp,
      firstMsg: (legacy as { firstMsg: string }).firstMsg,
      userMsgs: (legacy as { userMsgs: string[] }).userMsgs,
      mtime,
      title: typeof (legacy as { title?: unknown }).title === "string" ? (legacy as { title: string }).title : undefined,
    };
  }

  return null;
}

function scanClaudeSessions(limit?: number): HistorySession[] {
  const max = typeof limit === "number" ? limit : Number.MAX_SAFE_INTEGER;
  const config = getConfig();
  const cache = getCache() as Record<string, unknown>;
  const scanCache: Record<string, { mtime: number }> = {};

  for (const [key, value] of Object.entries(cache)) {
    const sourcePath = key.startsWith(CACHE_PREFIX) ? key.slice(CACHE_PREFIX.length) : key;
    const mtime = typeof (value as { mtime?: unknown }).mtime === "number" ? (value as { mtime: number }).mtime : null;
    if (mtime !== null) {
      scanCache[sourcePath] = { mtime };
    }
  }

  const sessions = scanAllSessions(max, scanCache, config.excludeDirs);
  const nextCache: Record<string, unknown> = { ...cache };
  const result: HistorySession[] = [];

  for (const session of sessions) {
    const cached = readCachedSession(session.filePath, session.mtime, cache);
    if (cached) {
      result.push(cached);
      nextCache[getCacheKey(session.filePath)] = cached;
      continue;
    }

    const reparsed = parseJsonl(session.filePath, session.mtime);
    if (!reparsed) {
      continue;
    }

    const normalized = normalizeSession(reparsed);
    result.push(normalized);
    nextCache[getCacheKey(session.filePath)] = {
      ...normalized,
      sourcePath: normalized.sourcePath,
    };
  }

  writeCache(nextCache);
  return result;
}

function buildNewInvocation(): { command: string; args: string[] } {
  const config = getConfig();
  return {
    command: config.claudeCommand,
    args: config.claudeArgs,
  };
}

function buildResumeInvocation(sessionId: string): { command: string; args: string[] } {
  const config = getConfig();
  return {
    command: config.claudeCommand,
    args: [...config.claudeArgs, "--resume", sessionId],
  };
}

export const claudeProvider: SessionProvider = {
  name: "claude",
  scanSessions(options?: { limit?: number; includeSubagents?: boolean }): HistorySession[] {
    return scanClaudeSessions(options?.limit);
  },
  buildNewInvocation,
  buildResumeInvocation,
};
