import { createHash } from "node:crypto";
import { basename } from "node:path";
import { getConfig, setSessionMeta, removeSessionMeta } from "../config/index.js";
import { detectBackend } from "../backends/detect.js";
import type { SessionBackend, ActiveSession } from "../backends/interface.js";
import { getProvider } from "../providers/index.js";
import type { HistorySession, ProviderName } from "../providers/interface.js";

let _backend: SessionBackend | null = null;

async function getBackend(): Promise<SessionBackend> {
  if (!_backend) _backend = await detectBackend();
  return _backend;
}

function getSessionNamePrefix(provider: ProviderName): string {
  return provider === "claude" ? "ch" : "ch-cx";
}

export function makeSessionName(
  cwd: string,
  description?: string,
  provider: ProviderName = "claude",
): string {
  const prefix = getSessionNamePrefix(provider);
  const dirName = basename(cwd) || provider;
  if (!description) return `${prefix}-${dirName}`;
  // Sanitize description for session name: keep ASCII alphanumeric, dash, underscore
  const safe = description
    .replace(/[^a-zA-Z0-9\-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  if (safe) return `${prefix}-${dirName}-${safe}`;
  // Fallback to hash if description is all non-ASCII (e.g. Chinese)
  const hash = createHash("md5").update(description).digest("hex").slice(0, 6);
  return `${prefix}-${dirName}-${hash}`;
}

function makeResumeSessionName(session: HistorySession): string {
  const prefix = getSessionNamePrefix(session.provider);
  const dirName = basename(session.cwd) || session.provider;
  return `${prefix}-${dirName}-${session.sessionId.slice(0, 8)}`;
}

export async function createNewSession(
  cwd: string,
  description?: string,
  provider: ProviderName = "claude",
): Promise<void> {
  const backend = await getBackend();
  const name = makeSessionName(cwd, description, provider);
  const invocation = getProvider(provider).buildNewInvocation(description);

  setSessionMeta(name, {
    description: description || "",
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: invocation.command,
    args: invocation.args,
    cwd,
    description,
  });
}

export async function forceNewSession(
  cwd: string,
  description?: string,
  provider: ProviderName = "claude",
): Promise<void> {
  const backend = await getBackend();
  const name = makeSessionName(cwd, description, provider);
  backend.killSession(name);
  removeSessionMeta(name);
  await createNewSession(cwd, description, provider);
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const backend = await getBackend();
  return backend.listSessions();
}

export async function attachToSession(name: string): Promise<void> {
  const backend = await getBackend();
  backend.attachSession(name);
}

export async function killSession(name: string): Promise<void> {
  const backend = await getBackend();
  backend.killSession(name);
  removeSessionMeta(name);
}

export async function resumeInSession(
  session: HistorySession,
  description?: string,
): Promise<void> {
  const backend = await getBackend();
  const cwd = session.cwd || process.cwd();
  const name = makeResumeSessionName(session);
  const invocation = getProvider(session.provider).buildResumeInvocation(session.sessionId);

  setSessionMeta(name, {
    description: description || session.sessionId.slice(0, 8),
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: invocation.command,
    args: invocation.args,
    cwd,
  });
}
