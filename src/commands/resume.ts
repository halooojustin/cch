import { loadSessions } from "../services/history.js";
import { resumeInSession } from "../services/session.js";
import type { ProviderSelection } from "../providers/interface.js";

export async function resumeCommand(
  sessionId: string,
  provider: ProviderSelection = "all",
): Promise<void> {
  const sessions = loadSessions(provider, Number.MAX_SAFE_INTEGER);
  const matches = sessions.filter((session) => session.sessionId === sessionId);

  if (matches.length === 1) {
    const match = matches[0];
    await resumeInSession(match, match.firstMsg.replace(/\n/g, " ").slice(0, 50));
  } else if (matches.length > 1) {
    console.error(`Session ID conflict: ${sessionId}`);
    console.error("Rerun with --provider claude or --provider codex.");
  } else {
    console.error(`Session not found: ${sessionId}`);
    console.error("Try `ch list` to see available sessions.");
  }
}
