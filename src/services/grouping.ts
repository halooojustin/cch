import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfig } from "../config/index.js";
import type { SessionInfo } from "../utils/jsonl.js";

const CONFIG_DIR = join(homedir(), ".config", "cch");
const GROUPS_FILE = join(CONFIG_DIR, "groups.json");

interface GroupInfo {
  name: string;
  description: string;
}

interface GroupCache {
  updatedAt: string;
  groups: Record<string, string>; // sessionId → groupName
  descriptions: Record<string, string>; // groupName → one-line description
}

function readGroups(): GroupCache {
  try {
    const data = JSON.parse(readFileSync(GROUPS_FILE, "utf-8"));
    return { updatedAt: data.updatedAt || "", groups: data.groups || {}, descriptions: data.descriptions || {} };
  } catch {
    return { updatedAt: "", groups: {}, descriptions: {} };
  }
}

function writeGroups(data: GroupCache): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(GROUPS_FILE, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Use AI to assign groups to sessions.
 * Takes top 50, sends them all together so AI can see full context.
 * Returns cache with groups and descriptions.
 */
export function assignGroups(sessions: SessionInfo[]): GroupCache {
  const cache = readGroups();

  // Only process top 50
  const top = sessions.slice(0, 50);
  const ungrouped = top.filter((s) => !cache.groups[s.sessionId]);

  if (ungrouped.length === 0) return cache;

  // Build rich context table — all top 50 sent together for better grouping
  const table = top
    .map((s) => {
      const id = s.sessionId.slice(0, 8);
      const cached = cache.groups[s.sessionId] ? `[已分组:${cache.groups[s.sessionId]}]` : "[待分组]";
      const project = s.project || s.cwd?.split("/").pop() || "~";
      const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 80);
      const extra = s.userMsgs?.slice(1, 3).map((m) => m.replace(/\n/g, " ").slice(0, 40)).join(" / ") || "";
      return `${id} ${cached} | ${project} | ${msg}${extra ? " | 后续: " + extra : ""}`;
    })
    .join("\n");

  const existingDescs = Object.entries(cache.descriptions)
    .map(([name, desc]) => `  ${name}: ${desc}`)
    .join("\n");

  const existingHint = existingDescs
    ? `\n已有分组:\n${existingDescs}\n对于 [已分组] 的会话不需要重新分组，只需要处理 [待分组] 的。`
    : "";

  const prompt = `你是一个开发者工作台的会话分类助手。以下是用户最近在不同项目中使用 Claude Code 的对话记录。

请仔细阅读每条会话的项目目录和对话内容，理解用户在做什么，然后按项目或工作主题分组。

会话列表（格式: 短ID [状态] | 项目目录 | 首条消息 | 后续消息）:
${table}
${existingHint}

要求:
1. 只处理 [待分组] 的会话
2. 分组名简短（2-6个字），用中文，体现项目或工作主题
3. 同一个项目目录的会话通常归一组，但如果内容明显不同可以分开
4. 在 ~ 或 ~/weller 下的会话是杂项，根据消息内容判断归哪组
5. 每个分组附带一句话描述（10-20字），说明这组会话在做什么

返回格式（严格遵守，不要多余文字）:
---GROUPS---
短ID:分组名
短ID:分组名
---DESCRIPTIONS---
分组名:一句话描述
分组名:一句话描述

例如:
---GROUPS---
abc12345:Donut后端
def67890:龙虾部署
---DESCRIPTIONS---
Donut后端:HIL 后端 API 开发和 bug 修复
龙虾部署:OpenClaw Gateway 在 GCP 上的部署运维`;

  const config = getConfig();

  try {
    const result = execFileSync(config.claudeCommand, ["-p", prompt], {
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const text = result.trim();
    const groupsSection = text.split("---DESCRIPTIONS---")[0]?.split("---GROUPS---")[1] || "";
    const descsSection = text.split("---DESCRIPTIONS---")[1] || "";

    // Parse groups
    for (const line of groupsSection.trim().split("\n")) {
      const match = line.match(/^([a-f0-9]{8}):(.+)$/);
      if (match) {
        const [, shortId, group] = match;
        const session = ungrouped.find((s) => s.sessionId.startsWith(shortId));
        if (session) {
          cache.groups[session.sessionId] = group.trim();
        }
      }
    }

    // Parse descriptions
    for (const line of descsSection.trim().split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const name = line.slice(0, idx).trim();
        const desc = line.slice(idx + 1).trim();
        if (name && desc) {
          cache.descriptions[name] = desc;
        }
      }
    }
  } catch {
    // AI failed — fallback to project-based grouping
    for (const s of ungrouped) {
      const group = s.project || s.cwd?.split("/").pop() || "其他";
      cache.groups[s.sessionId] = group;
      if (!cache.descriptions[group]) {
        cache.descriptions[group] = `${group} 项目相关会话`;
      }
    }
  }

  cache.updatedAt = new Date().toISOString();
  writeGroups(cache);
  return cache;
}

/**
 * Group sessions by their assigned group name.
 * Returns groups sorted by most recent session in each group.
 */
export function groupSessions(
  sessions: SessionInfo[],
  cache: GroupCache,
): Array<{ name: string; description: string; sessions: SessionInfo[] }> {
  const map = new Map<string, SessionInfo[]>();

  for (const s of sessions) {
    const group = cache.groups[s.sessionId] || s.project || "Other";
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(s);
  }

  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      description: cache.descriptions[name] || "",
      sessions: items,
    }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.mtime));
      const bMax = Math.max(...b.sessions.map((s) => s.mtime));
      return bMax - aMax;
    });
}
