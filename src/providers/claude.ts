import { scanAllSessions, type SessionInfo } from "../utils/jsonl.js";
import { getConfig } from "../config/index.js";
import type { HistorySession } from "./interface.js";
import type { SessionProvider } from "./interface.js";

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

function scanClaudeSessions(limit?: number): HistorySession[] {
  const max = typeof limit === "number" ? limit : Number.MAX_SAFE_INTEGER;
  return scanAllSessions(max).map(normalizeSession);
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
  scanSessions: scanClaudeSessions,
  buildNewInvocation,
  buildResumeInvocation,
};
