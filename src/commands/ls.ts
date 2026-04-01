import { loadSessions } from "../services/history.js";
import { resumeInSession, forkSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";

export async function lsCommand(n: number, useMux: boolean): Promise<void> {
  const sessions = loadSessions(n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  const labels = formatSessionLines(sessions);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, {
    hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · f Fork · Esc 取消`,
    forkKey: true,
  });

  if (selected.action === "fork") {
    const s = sessions[selected.value];
    await forkSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50), useMux);
  } else if (selected.action === "select") {
    const s = sessions[selected.value];
    await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50), useMux);
  }
}
