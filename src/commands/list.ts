import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import { shortenPath, decodePath } from "../utils/jsonl.js";
import { interactiveSelect, padEndWidth } from "../utils/select.js";

export async function listCommand(n: number): Promise<void> {
  const sessions = loadSessions(n);
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  const items = sessions.map((s, i) => {
    const num = String(i + 1).padStart(3);
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 30);
    const project = shortenPath(s.cwd || decodePath(s.filePath.split("/").slice(-2, -1)[0]));
    const ts = s.timestamp.slice(5, 16).replace("T", " ");
    return { label: `${num} ${padEndWidth(msg, 32)} ${padEndWidth(project, 22)} ${ts}`, value: i };
  });

  const selected = await interactiveSelect(items);
  if (selected >= 0) {
    const s = sessions[selected];
    await resumeInSession(s.sessionId, s.cwd);
  }
}
