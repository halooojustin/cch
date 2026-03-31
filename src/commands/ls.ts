import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { formatSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";
import type { ProviderSelection } from "../providers/interface.js";

function noSessionsMessage(provider: ProviderSelection): string {
  if (provider === "claude") {
    return "No sessions found in claude. Try --provider all.";
  }
  if (provider === "codex") {
    return "No sessions found in codex.";
  }
  return "No sessions found across all providers.";
}

export async function lsCommand(
  n: number,
  provider: ProviderSelection = "claude",
): Promise<void> {
  const sessions = loadSessions(provider, n);
  if (!sessions.length) {
    console.log(noSessionsMessage(provider));
    return;
  }

  const labels = formatSessionLines(sessions, provider);
  const items = labels.map((label, i) => ({ label, value: i }));

  const selected = await interactiveSelect(items, { hint: `↑↓/jk 导航 · 数字跳转 · Enter 恢复会话 · Esc 取消` });
  if (selected >= 0) {
    const session = sessions[selected];
    await resumeInSession(session, session.firstMsg.replace(/\n/g, " ").slice(0, 50));
  }
}
