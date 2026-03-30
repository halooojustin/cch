import { listActiveSessions, attachToSession } from "../services/session.js";
import { getSessionsMeta } from "../config/index.js";
import { interactiveSelect, padEndWidth } from "../utils/select.js";

export async function psCommand(): Promise<void> {
  const sessions = await listActiveSessions();
  if (!sessions.length) {
    console.log("No active multiplexer sessions.");
    return;
  }

  const meta = getSessionsMeta();

  // Sort by createdAt descending (newest first)
  sessions.sort((a, b) => {
    const timeA = meta[a.name]?.createdAt || "";
    const timeB = meta[b.name]?.createdAt || "";
    return timeB.localeCompare(timeA);
  });

  const items = sessions.map((s, i) => {
    const num = String(i + 1).padStart(3);
    const desc = meta[s.name]?.description || "";
    const label = desc
      ? `${num} ${s.name.padEnd(28)} ${s.created.padEnd(12)} ${desc}`
      : `${num} ${s.name.padEnd(28)} ${s.created}`;
    return { label, value: i };
  });

  const selected = await interactiveSelect(items);
  if (selected >= 0) {
    await attachToSession(sessions[selected].name);
  }
}
