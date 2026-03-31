import { getConfig } from "../config/index.js";
import { getProviders } from "../providers/index.js";
import type { HistorySession, ProviderSelection } from "../providers/interface.js";

function resolveLoadArgs(
  providerSelectionOrLimit?: ProviderSelection | number,
  limit?: number,
): { providerSelection: ProviderSelection; limit: number } {
  const config = getConfig();

  if (typeof providerSelectionOrLimit === "number") {
    return {
      providerSelection: "claude",
      limit: providerSelectionOrLimit,
    };
  }

  return {
    providerSelection: providerSelectionOrLimit ?? "claude",
    limit: limit ?? config.historyLimit,
  };
}

function sortByMtimeDesc(sessions: HistorySession[]): HistorySession[] {
  return [...sessions].sort((a, b) => b.mtime - a.mtime);
}

export function loadSessions(limit?: number): HistorySession[];
export function loadSessions(providerSelection?: ProviderSelection, limit?: number, showSubagents?: boolean): HistorySession[];
export function loadSessions(
  providerSelectionOrLimit?: ProviderSelection | number,
  limit?: number,
  showSubagents: boolean = false,
): HistorySession[] {
  const { providerSelection, limit: resolvedLimit } = resolveLoadArgs(providerSelectionOrLimit, limit);
  const providers = getProviders(providerSelection);
  const sessions = providers.flatMap((provider) =>
    provider.scanSessions({ limit: resolvedLimit, includeSubagents: showSubagents }),
  );
  return sortByMtimeDesc(sessions).slice(0, resolvedLimit);
}

function sessionSearchText(session: HistorySession): string {
  return [
    session.sessionId,
    session.sourcePath,
    session.cwd,
    session.gitBranch,
    session.timestamp,
    session.firstMsg,
    session.title ?? "",
    ...session.userMsgs,
  ]
    .join("\n")
    .toLowerCase();
}

export function searchSessions(keyword: string): HistorySession[];
export function searchSessions(keyword: string, providerSelection?: ProviderSelection, showSubagents?: boolean): HistorySession[];
export function searchSessions(
  keyword: string,
  providerSelection: ProviderSelection = "claude",
  showSubagents: boolean = false,
): HistorySession[] {
  const lowerKeyword = keyword.toLowerCase();
  return sortByMtimeDesc(loadSessions(providerSelection, Number.MAX_SAFE_INTEGER, showSubagents).filter((session) => sessionSearchText(session).includes(lowerKeyword)));
}
