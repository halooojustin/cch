import { loadSessions } from "../services/history.js";
import { aiSearch } from "../services/ai-search.js";
import { resumeInSession } from "../services/session.js";
import { getSessionProjectPath } from "../utils/jsonl.js";
import { createInterface } from "node:readline";

export async function defaultCommand(query: string): Promise<void> {
  console.log(`Searching for "${query}" ...\n`);

  const sessions = loadSessions();
  if (!sessions.length) {
    console.log("No Claude Code history found in ~/.claude/projects/");
    return;
  }

  const indices = aiSearch(query, sessions);
  if (!indices.length) {
    console.log("No matching sessions. Try `ch list` to browse all.");
    return;
  }

  console.log(`Found ${indices.length} matching session(s):\n`);
  for (let rank = 0; rank < indices.length; rank++) {
    const s = sessions[indices[rank] - 1];
    const ts = s.timestamp.slice(0, 16).replace("T", " ");
    const project = getSessionProjectPath(s);
    const branch = s.gitBranch || "-";
    const msg = s.firstMsg.replace(/\n/g, " ").slice(0, 70);
    console.log(`  [${rank + 1}] #${indices[rank]}  ${ts}  ${project}  [${branch}]`);
    console.log(`       ${msg}\n`);
  }

  if (!process.stdin.isTTY) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (indices.length === 1) {
    const answer = await new Promise<string>((resolve) => {
      rl.question("Resume this session? (Enter to confirm / n to cancel): ", resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() !== "n") {
      const s = sessions[indices[0] - 1];
      await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50));
    }
  } else {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Pick [1-${indices.length}] to resume (Enter to exit): `, resolve);
    });
    rl.close();
    const pick = parseInt(answer, 10);
    if (pick >= 1 && pick <= indices.length) {
      const s = sessions[indices[pick - 1] - 1];
      await resumeInSession(s.sessionId, s.cwd, s.firstMsg.replace(/\n/g, " ").slice(0, 50));
    }
  }
}
