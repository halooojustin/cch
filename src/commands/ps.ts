import { listActiveSessions, attachToSession, killSession } from "../services/session.js";
import { getSessionsMeta } from "../config/index.js";
import { interactiveSelect, padEndWidth } from "../utils/select.js";

export async function psCommand(): Promise<void> {
  while (true) {
    const sessions = await listActiveSessions();
    if (!sessions.length) {
      console.log("No active multiplexer sessions.");
      return;
    }

    const meta = getSessionsMeta();

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

    const result = await interactiveSelect(
      items,
      "Up/Down navigate, Enter attach, d kill, Esc cancel",
      { deleteKey: true },
    );

    if (result.action === "cancel") return;

    if (result.action === "delete") {
      const s = sessions[result.value];
      await killSession(s.name);
      console.log(`Killed: ${s.name}`);
      // Loop back to show updated list
      continue;
    }

    if (result.action === "select") {
      await attachToSession(sessions[result.value].name);
      return;
    }
  }
}
