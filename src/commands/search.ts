import { searchSessions } from "../services/history.js";
import { getSessionProjectPath } from "../utils/jsonl.js";
import { resumeInSession } from "../services/session.js";
import { createInterface } from "node:readline";

export async function searchCommand(keyword: string): Promise<void> {
  console.log(`Searching "${keyword}" ...`);
  const matches = searchSessions(keyword);

  if (!matches.length) {
    console.log(`No sessions found containing "${keyword}"`);
    return;
  }

  console.log(`\nFound ${matches.length} sessions:\n`);
  for (let i = 0; i < Math.min(matches.length, 15); i++) {
    const s = matches[i];
    const ts = s.timestamp.slice(0, 16).replace("T", " ");
    const project = getSessionProjectPath(s);
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 50);
    console.log(`  ${String(i + 1).padStart(2)}  ${ts}  ${project.padEnd(28)}  ${msg}`);
  }

  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("\nEnter number to resume (Enter to exit): ", resolve);
    });
    rl.close();
    const idx = parseInt(answer, 10);
    if (idx >= 1 && idx <= matches.length) {
      const s = matches[idx - 1];
      await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50));
    }
  }
}
