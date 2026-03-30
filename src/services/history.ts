import { readFileSync } from "node:fs";
import { scanAllSessions, collectFileEntries, parseJsonl, type SessionInfo } from "../utils/jsonl.js";
import { getCache, writeCache, getConfig } from "../config/index.js";

interface CacheEntry {
  mtime: number;
  sessionId: string;
  project: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
}

export function loadSessions(limit?: number): SessionInfo[] {
  const config = getConfig();
  const n = limit ?? config.historyLimit;
  const cache = getCache() as Record<string, CacheEntry>;
  // 传入 cache，让 scanAllSessions 跳过缓存命中文件的解析
  const sessions = scanAllSessions(n, cache, config.excludeDirs);
  const newCache: Record<string, CacheEntry> = {};

  const result: SessionInfo[] = [];
  for (const s of sessions) {
    const cached = cache[s.filePath];
    if (cached && cached.mtime === s.mtime) {
      // 从缓存恢复完整数据
      result.push({
        sessionId: cached.sessionId,
        filePath: s.filePath,
        project: cached.project || "",
        cwd: cached.cwd,
        gitBranch: cached.gitBranch,
        timestamp: cached.timestamp,
        firstMsg: cached.firstMsg,
        userMsgs: cached.userMsgs,
        mtime: cached.mtime,
      });
      newCache[s.filePath] = cached;
    } else {
      result.push(s);
      newCache[s.filePath] = {
        mtime: s.mtime,
        sessionId: s.sessionId,
        project: s.project,
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
  const config = getConfig();
  const matches: SessionInfo[] = [];
  const lowerKeyword = keyword.toLowerCase();

  try {
    const entries = collectFileEntries(config.excludeDirs);
    for (const entry of entries) {
      try {
        const content = readFileSync(entry.filePath, "utf-8");
        if (content.toLowerCase().includes(lowerKeyword)) {
          const info = parseJsonl(entry.filePath, entry.mtime);
          if (info) matches.push(info);
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* no projects dir */ }

  matches.sort((a, b) => b.mtime - a.mtime);
  return matches;
}
