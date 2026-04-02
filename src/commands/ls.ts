import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { assignGroups, groupSessions } from "../services/grouping.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { SessionInfo } from "../utils/jsonl.js";

export async function lsCommand(n: number, useMux: boolean, useGroup: boolean): Promise<void> {
  const sessions = loadSessions(useGroup ? Math.max(n, 50) : n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  let items: Array<{ label: string; value: number }>;
  let allSessions: SessionInfo[];

  if (useGroup) {
    process.stderr.write("Grouping sessions...\r");
    const cache = assignGroups(sessions);
    const grouped = groupSessions(sessions, cache);
    process.stderr.write("                    \r");

    items = [];
    allSessions = [];
    let globalIdx = 0;
    for (const group of grouped) {
      const lines = formatSessionLines(group.sessions);
      for (let i = 0; i < group.sessions.length; i++) {
        let prefix: string;
        if (i === 0) {
          // Group header: name + description
          const desc = group.description ? ` \x1b[2m${group.description}\x1b[0m` : "";
          prefix = `\x1b[33m[${group.name}]\x1b[0m${desc}\n    `;
        } else {
          prefix = "    ";
        }
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
    : `↑↓/jk 导航 · 数字跳转 · Enter 恢复 · Esc 取消 · \x1b[2mch ls -g 按项目分组\x1b[0m`;

  const selected = await interactiveSelect(items, { hint });

  if (selected >= 0 && allSessions[selected]) {
    const s = allSessions[selected];
    await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50), useMux);
  }
}
