import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseJsonl, type SessionInfo } from "../utils/jsonl.js";
import { claudeProvider } from "../providers/claude.js";
import type { HistorySession } from "../providers/interface.js";
import { getCache, writeCache, getConfig } from "../config/index.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

interface CacheEntry {
  mtime: number;
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
}

function mergeCachedSession(session: HistorySession, cached: CacheEntry | undefined): HistorySession {
  if (!cached) {
    return session;
  }

  return {
    ...session,
    cwd: cached.cwd,
    gitBranch: cached.gitBranch,
    timestamp: cached.timestamp,
    firstMsg: cached.firstMsg,
    userMsgs: cached.userMsgs,
    mtime: cached.mtime,
  };
}

export function loadSessions(limit?: number): HistorySession[] {
  const config = getConfig();
  const n = limit ?? config.historyLimit;
  const cache = getCache() as Record<string, CacheEntry>;
  const sessions = claudeProvider.scanSessions(n);
  const newCache: Record<string, CacheEntry> = {};

  const result: HistorySession[] = [];
  for (const s of sessions) {
    const cached = cache[s.sourcePath];
    if (cached && cached.mtime === s.mtime) {
      result.push(mergeCachedSession(s, cached));
      newCache[s.sourcePath] = cached;
    } else {
      result.push(s);
      newCache[s.sourcePath] = {
        mtime: s.mtime,
        sessionId: s.sessionId,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        timestamp: s.timestamp,
        firstMsg: s.firstMsg,
        userMsgs: s.userMsgs,
      };
    }
  }

  writeCache(newCache as unknown as Record<string, unknown>);
  return result;
}

export function searchSessions(keyword: string): SessionInfo[] {
  const matches: SessionInfo[] = [];

  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = join(PROJECTS_DIR, dir.name);
      const files = readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const filePath = join(projectPath, file.name);
        try {
          const content = readFileSync(filePath, "utf-8");
          if (content.toLowerCase().includes(keyword.toLowerCase())) {
            const info = parseJsonl(filePath);
            if (info) matches.push(info);
          }
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* no projects dir */ }

  matches.sort((a, b) => b.mtime - a.mtime);
  return matches;
}
