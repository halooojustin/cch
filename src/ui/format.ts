import { basename, dirname } from "node:path";
import type { HistorySession, ProviderSelection } from "../providers/interface.js";
import { dim, cyan, yellow, green } from "./colors.js";

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

export function padEndWidth(str: string, targetWidth: number): string {
  const width = stringWidth(str);
  return width >= targetWidth ? str : str + " ".repeat(targetWidth - width);
}

const dtfSameYear = new Intl.DateTimeFormat(undefined, {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dtfOtherYear = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const currentYear = new Date().getFullYear();

function localTime(ts: string | number): string {
  if (!ts) return "";
  const date = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts).slice(0, 16);
  const formatter = date.getFullYear() === currentYear ? dtfSameYear : dtfOtherYear;
  return formatter.format(date).replace(/\//g, "-");
}

function projectPath(session: HistorySession): string {
  if (session.cwd) return basename(session.cwd);
  if (session.sourcePath) {
    const sourceDir = dirname(session.sourcePath);
    const parentDir = basename(dirname(sourceDir));
    if (parentDir) return parentDir;
    return basename(sourceDir);
  }
  return "";
}

function branchText(session: HistorySession): string {
  if (!session.gitBranch) return "";
  return `[${session.gitBranch.length > 15 ? `${session.gitBranch.slice(0, 14)}…` : session.gitBranch}]`;
}

function providerMarker(session: HistorySession): string {
  return session.provider === "claude" ? "[cl]" : "[cx]";
}

export function formatSessionLines(
  sessions: HistorySession[],
  providerSelection: ProviderSelection = "claude",
): string[] {
  if (!sessions.length) return [];

  const showProvider = providerSelection === "all";
  const rows = sessions.map((session, index) => ({
    num: String(index + 1).padStart(String(sessions.length).length),
    provider: showProvider ? providerMarker(session) : "",
    project: projectPath(session),
    ts: localTime(session.mtime || session.timestamp),
    branch: branchText(session),
    msg: session.firstMsg.replace(/\n/g, " ").slice(0, 50),
  }));

  const maxProject = Math.min(Math.max(...rows.map((row) => stringWidth(row.project)), 0), 30);
  const maxBranch = Math.max(...rows.map((row) => stringWidth(row.branch)), 1);
  const hasProject = rows.some((row) => row.project);

  return rows.map((row) => {
    const parts = [dim(row.num)];
    if (showProvider) {
      parts.push(dim(row.provider));
    }
    if (hasProject) {
      const project = row.project.length > 30 ? row.project.slice(0, 30) : row.project;
      parts.push(cyan(padEndWidth(project, maxProject)));
    }
    parts.push(
      yellow(row.ts),
      row.branch ? green(padEndWidth(row.branch, maxBranch)) : " ".repeat(maxBranch),
      row.msg,
    );
    return parts.join(" ");
  });
}

export function formatActiveSessionLines(
  sessions: Array<{ name: string; created: string; description: string }>,
): string[] {
  const maxName = Math.min(Math.max(...sessions.map((session) => session.name.length)), 35);
  const maxTime = Math.max(...sessions.map((session) => session.created.length), 1);
  const numWidth = String(sessions.length).length;

  return sessions.map((session, index) => {
    const num = dim(String(index + 1).padStart(numWidth));
    const name = cyan(padEndWidth(session.name, maxName));
    const time = yellow(padEndWidth(session.created, maxTime));
    return `${num} ${name} ${time} ${session.description || ""}`;
  });
}
