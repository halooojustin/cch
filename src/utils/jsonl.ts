import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface SessionInfo {
  sessionId: string;
  filePath: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
  firstMsg: string;
  userMsgs: string[];
  mtime: number;
}

function stripTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "")
    .trim();
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && item.type === "text" && typeof item.text === "string") {
        return stripTags(item.text);
      }
    }
  }
  return "";
}

export function parseJsonl(filePath: string): SessionInfo | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").slice(0, 50);

    let cwd = "";
    let gitBranch = "";
    let timestamp = "";
    let firstMsg = "";
    const userMsgs: string[] = [];
    const sessionId = basename(filePath, ".jsonl");

    for (const line of lines) {
      if (!line.trim()) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && typeof data.cwd === "string") cwd = data.cwd;
      if (!gitBranch && typeof data.gitBranch === "string") gitBranch = data.gitBranch;
      if (!timestamp && typeof data.timestamp === "string") timestamp = data.timestamp;

      if (data.type === "user") {
        const msg = data.message as Record<string, unknown> | undefined;
        if (msg) {
          const text = extractUserText(msg.content);
          if (text) {
            if (!firstMsg) firstMsg = text.slice(0, 150);
            if (userMsgs.length < 5) userMsgs.push(text.slice(0, 100));
          }
        }
      }
    }

    if (!firstMsg) return null;

    const mtime = statSync(filePath).mtimeMs;
    if (!timestamp) {
      timestamp = new Date(mtime).toISOString();
    }

    return { sessionId, filePath, cwd, gitBranch, timestamp, firstMsg, userMsgs, mtime };
  } catch {
    return null;
  }
}

export function scanAllSessions(limit: number): SessionInfo[] {
  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const sessions: SessionInfo[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = join(PROJECTS_DIR, dir.name);
      const files = readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const info = parseJsonl(join(projectPath, file.name));
        if (info) sessions.push(info);
      }
    }

    sessions.sort((a, b) => b.mtime - a.mtime);
    return sessions.slice(0, limit);
  } catch {
    return [];
  }
}

export function decodePath(dirname: string): string {
  if (dirname.startsWith("-")) {
    return "/" + dirname.slice(1).replace(/-/g, "/");
  }
  return dirname.replace(/-/g, "/");
}

export function shortenPath(path: string): string {
  const home = homedir();
  let p = path.startsWith(home) ? "~" + path.slice(home.length) : path;
  const parts = p.split("/");
  if (parts.length > 4) p = ".../" + parts.slice(-3).join("/");
  return p;
}

export function getSessionProjectPath(session: {
  cwd: string;
  sourcePath?: string;
  filePath?: string;
}): string {
  const path = session.sourcePath ?? session.filePath ?? "";
  return shortenPath(session.cwd || decodePath(path.split("/").slice(-2, -1)[0]));
}
