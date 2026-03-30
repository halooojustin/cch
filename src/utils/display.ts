import type { SessionInfo } from "./jsonl.js";
import { getSessionProjectPath } from "./jsonl.js";
import { getSessionsMeta } from "../config/index.js";

export function formatSessionTable(sessions: SessionInfo[]): string {
  const header = `  #  Time              Project                        Branch          First Message`;
  const divider = "\u2500".repeat(100);
  const rows = sessions.map((s, i) => {
    const num = String(i + 1).padStart(3);
    const ts = (s.timestamp.slice(0, 16).replace("T", " ")) || "";
    const project = getSessionProjectPath(s).padEnd(30);
    const branch = (s.gitBranch || "-").slice(0, 14).padEnd(15);
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 50);
    return `${num}  ${ts}  ${project}  ${branch}  ${msg}`;
  });
  return [header, divider, ...rows].join("\n");
}

export function formatActiveSessions(
  sessions: Array<{ name: string; created: string; status: string }>,
): string {
  const meta = getSessionsMeta();
  const claude: string[] = [];
  const other: string[] = [];

  for (const s of sessions) {
    const desc = meta[s.name]?.description;
    const line = `  ${s.name.padEnd(25)} ${s.created.padEnd(12)} ${desc ? `  ${desc}` : ""}`;
    if (s.name.startsWith("ch-")) {
      claude.push(line);
    } else {
      other.push(line);
    }
  }

  const parts: string[] = [];
  parts.push("Claude Sessions:");
  parts.push("\u2500".repeat(50));
  parts.push(claude.length ? claude.join("\n") : "  (none)");
  parts.push("");
  parts.push("Other Sessions:");
  parts.push("\u2500".repeat(50));
  parts.push(other.length ? other.join("\n") : "  (none)");
  return parts.join("\n");
}
