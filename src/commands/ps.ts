import { listActiveSessions, attachToSession, killSession } from "../services/session.js";
import { getSessionsMeta } from "../config/index.js";
import { formatActiveSessionLines } from "../ui/format.js";
import { interactiveSelect } from "../ui/select.js";

export async function psCommand(): Promise<void> {
  let cursorPos = 0;
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

    const data = sessions.map((s) => ({
      name: s.name,
      created: s.created,
      description: meta[s.name]?.description || "",
    }));

    const labels = formatActiveSessionLines(data);
    const items = labels.map((label, i) => ({ label, value: i }));

    const selected = await interactiveSelect(items, {
      hint: "↑↓/jk 导航 · Enter 连接 · dd 终止 · Esc 取消",
      initialCursor: cursorPos,
      deleteKey: true,
    });

    if (typeof selected === "object" && "action" in selected) {
      if (selected.action === "cancel") return;
      if (selected.action === "delete") {
        const s = sessions[selected.value];
        cursorPos = selected.value;
        await killSession(s.name);
        continue;
      }
      if (selected.action === "select") {
        await attachToSession(sessions[selected.value].name);
        return;
      }
    } else {
      // 简单模式返回
      if (selected < 0) return;
      await attachToSession(sessions[selected].name);
      return;
    }
  }
}
