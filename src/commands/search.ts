import { searchSessions } from "../services/history.js";
import { resumeInSession, forkSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import pc from "picocolors";

export async function searchCommand(keyword: string): Promise<void> {
  console.log(`Searching "${keyword}" ...`);
  const matches = searchSessions(keyword);

  if (!matches.length) {
    console.log(`No sessions found containing "${keyword}"`);
    return;
  }

  console.log(pc.dim(`\nFound ${matches.length} sessions:\n`));

  const top = matches.slice(0, 50);
  const labels = formatSessionLines(top);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, {
    hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · f Fork · Esc 取消`,
    forkKey: true,
  });

  if (selected.action === "fork") {
    const s = top[selected.value];
    await forkSession(s.sessionId, s.cwd);
  } else if (selected.action === "select") {
    const s = top[selected.value];
    await resumeInSession(s.sessionId, s.cwd);
  }
}
