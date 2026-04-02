import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { assignGroups, groupSessions } from "../services/grouping.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { SessionInfo } from "../utils/jsonl.js";

export async function lsCommand(n: number, useMux: boolean, useGroup: boolean): Promise<void> {
  const sessions = loadSessions(n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  let items: Array<{ label: string; value: number }>;
  let allSessions: SessionInfo[];

  if (useGroup) {
    process.stderr.write("Grouping sessions...\r");
    const groups = assignGroups(sessions);
    const grouped = groupSessions(sessions, groups);
    process.stderr.write("                    \r");

    items = [];
    allSessions = [];
    let globalIdx = 0;
    for (const group of grouped) {
      const lines = formatSessionLines(group.sessions);
      for (let i = 0; i < group.sessions.length; i++) {
        const prefix = i === 0 ? `\x1b[33m[${group.name}]\x1b[0m ` : "  ";
        items.push({ label: `${prefix}${lines[i]}`, value: globalIdx });
        allSessions.push(group.sessions[i]);
        globalIdx++;
      }
    }
  } else {
    allSessions = sessions;
    const lines = formatSessionLines(sessions);
    items = lines.map((label, i) => ({ label, value: i }));
  }

  const hint = useGroup
    ? `↑↓/jk 导航 · 数字跳转 · Enter 恢复 · Esc 取消`
    : `↑↓/jk 导航 · 数字跳转 · Enter 恢复 · Esc 取消 · 提示: ch ls -g 可按项目分组`;

  const selected = await interactiveSelect(items, { hint });

  if (selected >= 0 && allSessions[selected]) {
    const s = allSessions[selected];
    await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50), useMux);
  }
}
