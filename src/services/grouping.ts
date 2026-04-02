import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfig } from "../config/index.js";
import type { SessionInfo } from "../utils/jsonl.js";

const CONFIG_DIR = join(homedir(), ".config", "cch");
const GROUPS_FILE = join(CONFIG_DIR, "groups.json");

interface GroupCache {
  updatedAt: string;
  groups: Record<string, string>; // sessionId → groupName
}

function readGroups(): GroupCache {
  try {
    return JSON.parse(readFileSync(GROUPS_FILE, "utf-8"));
  } catch {
    return { updatedAt: "", groups: {} };
  }
}

function writeGroups(data: GroupCache): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(GROUPS_FILE, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Use AI to assign groups to sessions that don't have one yet.
 * Returns a map of sessionId → groupName.
 */
export function assignGroups(sessions: SessionInfo[]): Record<string, string> {
  const cache = readGroups();
  const ungrouped = sessions.filter((s) => !cache.groups[s.sessionId]);

  if (ungrouped.length === 0) return cache.groups;

  // Build table of ungrouped sessions for AI
  const table = ungrouped
    .map((s, i) => {
      const project = s.project || s.cwd?.split("/").pop() || "unknown";
      const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 60);
      return `${s.sessionId.slice(0, 8)} | ${project} | ${msg}`;
    })
    .join("\n");

  // Also provide existing group names for consistency
  const existingGroups = [...new Set(Object.values(cache.groups))].filter(Boolean);
  const groupHint = existingGroups.length
    ? `\n\n已有的分组名: ${existingGroups.join(", ")}\n尽量复用已有分组名，必要时可以新建。`
    : "";

  const prompt = `你是一个会话分类助手。请将以下 Claude Code 会话按项目或主题分组。

会话列表（格式: ID | 项目目录 | 首条消息）:
${table}
${groupHint}

规则:
1. 每个会话归到一个分组
2. 分组名简短（2-4个词），用中文
3. 相同项目目录的通常归一组
4. ~/weller 或 ~ 下的杂项，根据消息内容归类
5. 返回格式: 每行一个 "ID:分组名"，不要其他文字

例如:
abc12345:Donut产品开发
def67890:OpenClaw部署
ghi11111:个人工具配置`;

  const config = getConfig();

  try {
    const result = execFileSync(config.claudeCommand, ["-p", prompt], {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Parse AI response
    for (const line of result.trim().split("\n")) {
      const match = line.match(/^([a-f0-9]{8}):(.+)$/);
      if (match) {
        const [, shortId, group] = match;
        const session = ungrouped.find((s) => s.sessionId.startsWith(shortId));
        if (session) {
          cache.groups[session.sessionId] = group.trim();
        }
      }
    }
  } catch {
    // AI failed — fallback to project-based grouping
    for (const s of ungrouped) {
      const project = s.project || s.cwd?.split("/").pop() || "other";
      cache.groups[s.sessionId] = project;
    }
  }

  cache.updatedAt = new Date().toISOString();
  writeGroups(cache);
  return cache.groups;
}

/**
 * Group sessions by their assigned group name.
 * Returns groups sorted by most recent session in each group.
 */
export function groupSessions(
  sessions: SessionInfo[],
  groups: Record<string, string>,
): Array<{ name: string; sessions: SessionInfo[] }> {
  const map = new Map<string, SessionInfo[]>();

  for (const s of sessions) {
    const group = groups[s.sessionId] || s.project || "Other";
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(s);
  }

  // Sort groups by most recent session's mtime
  return [...map.entries()]
    .map(([name, items]) => ({ name, sessions: items }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.mtime));
      const bMax = Math.max(...b.sessions.map((s) => s.mtime));
      return bMax - aMax;
    });
}
