import { createHash } from "node:crypto";
import { basename } from "node:path";
import { getConfig, setSessionMeta, removeSessionMeta } from "../config/index.js";
import { detectBackend } from "../backends/detect.js";
import type { SessionBackend, ActiveSession } from "../backends/interface.js";

let _backend: SessionBackend | null = null;

async function getBackend(): Promise<SessionBackend> {
  if (!_backend) _backend = await detectBackend();
  return _backend;
}

export function makeSessionName(cwd: string, description?: string): string {
  const dirName = basename(cwd);
  if (!description) return `ch-${dirName}`;
  // Sanitize description for session name: keep ASCII alphanumeric, dash, underscore
  const safe = description
    .replace(/[^a-zA-Z0-9\-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  if (safe) return `ch-${dirName}-${safe}`;
  // Fallback to hash if description is all non-ASCII (e.g. Chinese)
  const hash = createHash("md5").update(description).digest("hex").slice(0, 6);
  return `ch-${dirName}-${hash}`;
}

function getCmuxHookArgs(): string[] {
  if (!process.env.CMUX_SOCKET_PATH) return [];
  const hooks = {
    SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "cmux claude-hook session-start", timeout: 10 }] }],
    Stop: [{ matcher: "", hooks: [{ type: "command", command: "cmux claude-hook stop", timeout: 10 }] }],
    SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: "cmux claude-hook session-end", timeout: 1 }] }],
    Notification: [{ matcher: "", hooks: [{ type: "command", command: "cmux claude-hook notification", timeout: 10 }] }],
  };
  return ["--settings", JSON.stringify({ hooks })];
}

export async function createNewSession(cwd: string, description?: string): Promise<void> {
  const backend = await getBackend();
  const config = getConfig();
  const name = makeSessionName(cwd, description);

  setSessionMeta(name, {
    description: description || "",
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: config.claudeCommand,
    args: [...config.claudeArgs, ...getCmuxHookArgs()],
    cwd,
    description,
  });
}

export async function forceNewSession(cwd: string, description?: string): Promise<void> {
  const backend = await getBackend();
  const name = makeSessionName(cwd, description);
  backend.killSession(name);
  removeSessionMeta(name);
  await createNewSession(cwd, description);
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

export async function resumeInSession(sessionId: string, cwd: string, description?: string): Promise<void> {
  const backend = await getBackend();
  const config = getConfig();
  const dirName = basename(cwd);
  const name = `ch-${dirName}-${sessionId.slice(0, 8)}`;

  setSessionMeta(name, {
    description: description || sessionId.slice(0, 8),
    cwd,
    createdAt: new Date().toISOString(),
  });

  backend.createSession({
    name,
    command: config.claudeCommand,
    args: [...config.claudeArgs, ...getCmuxHookArgs(), "--resume", sessionId],
    cwd,
  });
}
