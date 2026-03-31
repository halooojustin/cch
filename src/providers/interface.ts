export type ProviderName = "claude" | "codex";
export type ProviderSelection = ProviderName | "all";

export interface HistorySession {
  provider: ProviderName;
  sessionId: string;
  sourcePath: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  mtime: number;
  title?: string;
  agentRole?: string;
}

export interface SessionProvider {
  name: ProviderName;
  scanSessions(options?: { limit?: number; includeSubagents?: boolean }): HistorySession[];
  buildNewInvocation(description?: string): { command: string; args: string[] };
  buildResumeInvocation(sessionId: string): { command: string; args: string[] };
}
