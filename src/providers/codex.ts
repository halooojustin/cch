import { getConfig } from "../config/index.js";
import {
  CODEX_SESSION_INDEX,
  CODEX_STATE_DB,
  mapCodexThreadRowToHistorySession,
  readCodexThreadsFromIndex,
  readCodexThreadsFromSqlite,
  type CodexThreadRow,
} from "../utils/codex-state.js";
import type { HistorySession, SessionProvider } from "./interface.js";

export interface CodexProviderOptions {
  dbPath?: string;
  indexPath?: string;
  readSqliteRows?: (dbPath: string, limit?: number) => CodexThreadRow[];
  readIndexRows?: (indexPath: string) => CodexThreadRow[];
}

function loadSessions(options: CodexProviderOptions, limit?: number): HistorySession[] {
  const dbPath = options.dbPath ?? CODEX_STATE_DB;
  const indexPath = options.indexPath ?? CODEX_SESSION_INDEX;
  const readSqliteRows = options.readSqliteRows ?? ((path: string, max?: number) => readCodexThreadsFromSqlite(path, max));
  const readIndexRows = options.readIndexRows ?? ((path: string) => readCodexThreadsFromIndex(path));

  try {
    return readSqliteRows(dbPath, limit)
      .slice(0, typeof limit === "number" ? limit : undefined)
      .map((row) => mapCodexThreadRowToHistorySession(row, dbPath));
  } catch {
    try {
      return readIndexRows(indexPath)
        .slice(0, typeof limit === "number" ? limit : undefined)
        .map((row) => mapCodexThreadRowToHistorySession(row, indexPath));
    } catch {
      return [];
    }
  }
}

export function createCodexProvider(options: CodexProviderOptions = {}): SessionProvider {
  return {
    name: "codex",
    scanSessions(limit?: number): HistorySession[] {
      return loadSessions(options, limit);
    },
    buildNewInvocation(): { command: string; args: string[] } {
      const config = getConfig();
      return {
        command: config.codexCommand,
        args: config.codexArgs,
      };
    },
    buildResumeInvocation(sessionId: string): { command: string; args: string[] } {
      const config = getConfig();
      return {
        command: config.codexCommand,
        args: [...config.codexArgs, "resume", sessionId],
      };
    },
  };
}

export const codexProvider = createCodexProvider();

