import { aiSearch } from "../services/ai-search.js";
import { resumeInSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { ProviderSelection } from "../providers/interface.js";
import pc from "picocolors";

function noMatchMessage(provider: ProviderSelection): string {
  if (provider === "claude") {
    return "No matching sessions in claude. Try --provider all.";
  }
  if (provider === "codex") {
    return "No matching sessions in codex.";
  }
  return "No matching sessions in all providers.";
}

export async function defaultCommand(
  query: string,
  provider: ProviderSelection = "claude",
  showSubagents: boolean = false,
): Promise<void> {
  console.log(`Searching for "${query}" ...\n`);

  const matched = aiSearch(query, provider, showSubagents);
  if (!matched.length) {
    console.log(noMatchMessage(provider));
    return;
  }

  console.log(pc.dim(`Found ${matched.length} matching session(s):\n`));

  const labels = formatSessionLines(matched, provider, showSubagents);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, { hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · Esc 取消` });
  if (selected >= 0) {
    const session = matched[selected];
    await resumeInSession(session, session.firstMsg.replace(/\n/g, " ").slice(0, 50));
  }
}
