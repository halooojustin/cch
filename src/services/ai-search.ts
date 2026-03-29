import { execFileSync } from "node:child_process";
import { getConfig } from "../config/index.js";
import { shortenPath, decodePath } from "../utils/jsonl.js";
import type { SessionInfo } from "../utils/jsonl.js";

function buildTable(sessions: SessionInfo[]): string {
  return sessions
    .map((s, i) => {
      const num = i + 1;
      const ts = s.timestamp.slice(0, 16).replace("T", " ");
      const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0]));
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

export function aiSearch(query: string, sessions: SessionInfo[]): number[] {
  const config = getConfig();
  const table = buildTable(sessions);

  const prompt = `你是一个会话历史搜索助手。用户想找到之前的某个 Claude Code 对话。

以下是所有会话列表（按时间倒序，#编号 时间 项目路径 [分支] 首条消息）：

${table}

用户的描述："${query}"

请从列表中找出最匹配的 1-3 个会话。只返回编号，用逗号分隔，不要其他文字。
如果没有匹配的，返回 "0"。
例如：3,7,12`;

  try {
    const result = execFileSync(config.claudeCommand, ["-p", prompt], {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const indices: number[] = [];
    for (const part of result.trim().replace(/\s/g, "").split(",")) {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= sessions.length) {
        indices.push(n);
      }
    }
    return indices;
  } catch {
    return [];
  }
}
