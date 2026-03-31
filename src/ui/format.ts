import { basename } from "node:path";
import { dim, cyan, yellow, green } from "./colors.js";
import { decodePath, type SessionInfo } from "../utils/jsonl.js";

/** CJK 双宽字符检测 */
function isWide(code: number): boolean {
  return code >= 0x1100 && (
    (code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  );
}

/** 计算显示宽度（考虑 CJK 双宽字符，忽略 ANSI codes） */
export function stringWidth(str: string): number {
  const plain = str.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (let i = 0; i < plain.length; i++) {
    const code = plain.codePointAt(i)!;
    width += isWide(code) ? 2 : 1;
    if (code > 0xffff) i++;
  }
  return width;
}

/** 按显示宽度填充 */
export function padEndWidth(str: string, targetWidth: number): string {
  const w = stringWidth(str);
  return w >= targetWidth ? str : str + " ".repeat(targetWidth - w);
}

const dtfSameYear = new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const dtfOtherYear = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const currentYear = new Date().getFullYear();

/** 将时间转为本地显示，同年 MM-DD HH:mm，跨年 YYYY-MM-DD HH:mm */
function localTime(ts: string | number): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  const fmt = d.getFullYear() === currentYear ? dtfSameYear : dtfOtherYear;
  return fmt.format(d).replace(/\//g, "-");
}

/**
 * 从 SessionInfo 提取项目列显示名：仅取路径最后一级目录（basename），
 * 避免 shortenPath 的多段缩写占用列宽；与 jsonl 里 project 字段语义一致。
 */
function projectPath(s: SessionInfo): string {
  if (s.project) return basename(s.project);
  if (s.cwd) return basename(s.cwd);
  const dir = s.filePath?.split("/").slice(-2, -1)[0];
  return dir ? basename(decodePath(dir)) : "";
}

/** 提取分支显示文本 */
function branchText(s: SessionInfo): string {
  return s.gitBranch ? `[${s.gitBranch.length > 15 ? s.gitBranch.slice(0, 14) + "…" : s.gitBranch}]` : "";
}

/**
 * 批量格式化会话行（动态计算列宽，保证对齐）
 */
export function formatSessionLines(sessions: SessionInfo[]): string[] {
  // 阶段1：提取纯文本，计算各列最大宽度
  const rows = sessions.map((s, i) => ({
    num: String(i + 1).padStart(String(sessions.length).length),
    project: projectPath(s),
    ts: localTime(s.mtime || s.timestamp),
    branch: branchText(s),
    msg: s.firstMsg.replace(/\n/g, " ").slice(0, 50),
  }));

  const maxProject = Math.min(Math.max(...rows.map((r) => stringWidth(r.project))), 30);
  const maxBranch = Math.max(...rows.map((r) => stringWidth(r.branch)), 1);

  const hasProject = rows.some((r) => r.project);

  // 阶段2：用统一列宽格式化
  return rows.map((r) => {
    const num = dim(r.num);
    const ts = yellow(r.ts);
    const branch = r.branch
      ? green(padEndWidth(r.branch, maxBranch))
      : " ".repeat(maxBranch);
    const parts = [num];
    if (hasProject) {
      parts.push(cyan(padEndWidth(r.project.length > 30 ? r.project.slice(0, 30) : r.project, maxProject)));
    }
    parts.push(ts, branch, r.msg);
    return parts.join(" ");
  });
}

/** 批量格式化活跃会话行 */
export function formatActiveSessionLines(
  sessions: Array<{ name: string; created: string; description: string }>,
): string[] {
  const maxName = Math.min(Math.max(...sessions.map((s) => s.name.length)), 35);
  const maxTime = Math.max(...sessions.map((s) => s.created.length), 1);
  const numWidth = String(sessions.length).length;

  return sessions.map((s, i) => {
    const num = dim(String(i + 1).padStart(numWidth));
    const name = cyan(padEndWidth(s.name, maxName));
    const time = yellow(padEndWidth(s.created, maxTime));
    const desc = s.description || "";
    return `${num} ${name} ${time} ${desc}`;
  });
}
