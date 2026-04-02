import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { assignGroups, groupSessions } from "../services/grouping.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { SessionInfo } from "../utils/jsonl.js";

export async function lsCommand(n: number, useMux: boolean): Promise<void> {
  const sessions = loadSessions(n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  // Assign groups via AI (cached, only new sessions get classified)
  process.stderr.write("Grouping sessions...\r");
  const groups = assignGroups(sessions);
  const grouped = groupSessions(sessions, groups);
  process.stderr.write("                    \r");

  // Build flat list with group labels prepended
  const items: Array<{ label: string; value: number }> = [];
  const allSessions: SessionInfo[] = [];

  let globalIdx = 0;
  for (const group of grouped) {
    const lines = formatSessionLines(group.sessions);
    for (let i = 0; i < group.sessions.length; i++) {
      // First item in group gets the group header
      const prefix = i === 0 ? `\x1b[33m[${group.name}]\x1b[0m ` : "  ";
      items.push({ label: `${prefix}${lines[i]}`, value: globalIdx });
      allSessions.push(group.sessions[i]);
      globalIdx++;
    }
  }

  const selected = await interactiveSelect(items, {
    hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · Esc 取消`,
  });

  if (selected >= 0 && allSessions[selected]) {
    const s = allSessions[selected];
    await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50), useMux);
  }
}
