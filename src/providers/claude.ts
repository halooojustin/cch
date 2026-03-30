import { scanAllSessions, type SessionInfo } from "../utils/jsonl.js";
import type { HistorySession } from "./interface.js";

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

export function scanSessions(limit?: number): HistorySession[] {
  const max = typeof limit === "number" ? limit : Number.MAX_SAFE_INTEGER;
  return scanAllSessions(max).map(normalizeSession);
}
