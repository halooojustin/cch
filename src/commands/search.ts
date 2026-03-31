import { searchSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { ProviderSelection } from "../providers/interface.js";
import pc from "picocolors";

function noSessionsMessage(provider: ProviderSelection): string {
  if (provider === "claude") {
    return "No sessions found in claude. Try --provider all.";
  }
  if (provider === "codex") {
    return "No sessions found in codex.";
  }
  return "No sessions found across all providers.";
}

export async function searchCommand(
  keyword: string,
  provider: ProviderSelection = "claude",
  showSubagents: boolean = false,
): Promise<void> {
  console.log(`Searching "${keyword}" ...`);
  const matches = searchSessions(keyword, provider, showSubagents);

  if (!matches.length) {
    console.log(noSessionsMessage(provider));
    return;
  }

  console.log(pc.dim(`\nFound ${matches.length} sessions:\n`));

  const top = matches.slice(0, 50);
  const labels = formatSessionLines(top, provider, showSubagents);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, { hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · Esc 取消` });
  if (selected >= 0) {
    const session = top[selected];
    await resumeInSession(session, session.firstMsg.replace(/\n/g, " ").slice(0, 50));
  }
}
