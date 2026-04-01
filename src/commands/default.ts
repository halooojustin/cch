import { aiSearch } from "../services/ai-search.js";
import { resumeInSession, forkSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import pc from "picocolors";

export async function defaultCommand(query: string): Promise<void> {
  console.log(`Searching for "${query}" ...\n`);

  const matched = aiSearch(query);
  if (!matched.length) {
    console.log("No matching sessions. Try `ch ls` to browse all.");
    return;
  }

  console.log(pc.dim(`Found ${matched.length} matching session(s):\n`));

  const labels = formatSessionLines(matched);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, {
    hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · f Fork · Esc 取消`,
    forkKey: true,
  });

  if (selected.action === "fork") {
    const s = matched[selected.value];
    await forkSession(s.sessionId, s.cwd);
  } else if (selected.action === "select") {
    const s = matched[selected.value];
    await resumeInSession(s.sessionId, s.cwd);
  }
}
