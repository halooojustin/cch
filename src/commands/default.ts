import { aiSearch } from "../services/ai-search.js";
import { resumeInSession } from "../services/session.js";
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

  const selected = await interactiveSelect(items, { hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · Esc 取消` });
  if (selected >= 0) {
    const s = matched[selected];
    await resumeInSession(s.sessionId, s.cwd);
  }
}
