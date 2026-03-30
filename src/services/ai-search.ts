import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getConfig } from "../config/index.js";
import { loadSessions } from "./history.js";
import { findSessionById } from "../utils/jsonl.js";
import type { SessionInfo } from "../utils/jsonl.js";

const CLAUDE_MEM_DB = join(homedir(), ".claude-mem", "claude-mem.db");

function isClaudeMemInstalled(): boolean {
  return existsSync(CLAUDE_MEM_DB);
}

const OBS_IDS_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    observationIds: {
      type: "array",
      items: { type: "integer", description: "observation ID" },
    },
  },
  required: ["observationIds"],
});

const MEM_SEARCH_PROMPT = `你是一个会话历史搜索助手。调用 claude-mem:mem-search 的 skill，传入用户关键词，返回最相关的 Observation IDs。

用户 Prompt：`;

/** 通过 sqlite3 将 observation IDs 转为 sessionIds */
function obsIdsToSessionIds(obsIds: number[]): string[] {
  const placeholders = obsIds.join(",");
  const sql = `SELECT DISTINCT s.content_session_id FROM observations o JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id WHERE o.id IN (${placeholders}) AND s.content_session_id IS NOT NULL AND s.content_session_id != '' ORDER BY o.created_at_epoch DESC;`;
  try {
    const raw = execFileSync("sqlite3", [CLAUDE_MEM_DB, sql], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** 通过 Claude CLI + mem-search skill 搜索，返回匹配的 sessionId 列表 */
function memSearch(query: string): string[] {
  const config = getConfig();
  const prompt = MEM_SEARCH_PROMPT + `"${query}"`;

  try {
    const raw = execFileSync(config.claudeCommand, [
      ...config.claudeArgs,
      "-p", prompt,
      "--model", "haiku",
      "--fallback-model", "sonnet",
      "--output-format", "json",
      "--no-session-persistence",
      "--json-schema", OBS_IDS_SCHEMA,
      "--allowedTools", "mcp__plugin_claude-mem_mcp-search__*",
    ], {
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(raw);
    const content = parsed.structured_output ?? parsed;
    const obsIds: number[] = content.observationIds ?? [];
    if (!obsIds.length) return [];
    return obsIdsToSessionIds(obsIds);
  } catch {
    return [];
  }
}

// --- 原有 Claude CLI 搜索（需要 loadSessions） ---

function buildTable(sessions: SessionInfo[]): string {
  return sessions
    .map((s, i) => {
      const num = i + 1;
      const ts = s.timestamp.slice(0, 16).replace("T", " ");
      const project = s.project || "-";
      const branch = s.gitBranch || "-";
      const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 80);
      const extra = s.userMsgs
        .slice(1, 4)
        .map((m) => m.replace(/\n/g, " ").slice(0, 60))
        .join(" / ");
      let line = `#${num}  ${ts}  ${project}  [${branch}]  ${msg}`;
      if (extra) line += `  more: ${extra}`;
      return line;
    })
    .join("\n");
}

function claudeSearch(query: string): SessionInfo[] {
  const config = getConfig();
  const sessions = loadSessions();
  if (!sessions.length) return [];

  const table = buildTable(sessions);

  const prompt = `你是一个会话历史搜索助手。用户想找到之前的某个 Claude Code 对话。

以下是所有会话列表（按时间倒序，#编号 时间 项目路径 [分支] 首条消息）：

${table}

用户的描述："${query}"

请从列表中找出最匹配的 1-3 个会话。只返回编号，用逗号分隔，不要其他文字。
如果没有匹配的，返回 "0"。
例如：3,7,12`;

  try {
    const result = execFileSync(config.claudeCommand, [
      ...config.claudeArgs,
      "-p", prompt,
      "--model", "haiku",
      "--no-session-persistence",
      "--fallback-model", "sonnet",
    ], {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const matched: SessionInfo[] = [];
    for (const part of result.trim().replace(/\s/g, "").split(",")) {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= sessions.length) {
        matched.push(sessions[n - 1]);
      }
    }
    return matched;
  } catch {
    return [];
  }
}

// --- 统一入口 ---

export function aiSearch(query: string): SessionInfo[] {
  if (isClaudeMemInstalled()) {
    const results = memSearch(query);
    if (results.length > 0) {
      const { excludeDirs } = getConfig();
      const sessions = results.map((id) => findSessionById(id, excludeDirs)).filter((s) => s !== null);
      return sessions.length > 0 ? sessions : claudeSearch(query);
    }
  }
  return claudeSearch(query);
}
