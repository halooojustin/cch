import { execFileSync, execSync } from "node:child_process";
import type { SessionBackend, ActiveSession, CreateSessionOpts } from "./interface.js";

export class TmuxBackend implements SessionBackend {
  name = "tmux";

  isAvailable(): boolean {
    try {
      execFileSync("which", ["tmux"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): ActiveSession[] {
    try {
      const raw = execFileSync("tmux", ["list-sessions", "-F", "#{session_name} #{session_created}"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.trim().split(" ");
          const name = parts[0];
          const epoch = parseInt(parts[1], 10);
          const ago = epoch ? formatAgo(epoch) : "";
          return { name, created: ago, status: "running" as const };
        });
    } catch {
      return [];
    }
  }

  createSession(opts: CreateSessionOpts): void {
    const cmd = [opts.command, ...opts.args].join(" ");

    try {
      execFileSync("tmux", ["has-session", "-t", opts.name], { stdio: "pipe" });
      execSync(`tmux attach -t "${opts.name}"`, { stdio: "inherit" });
      return;
    } catch {
      // session doesn't exist, create it
    }

    execSync(
      `tmux new-session -d -s "${opts.name}" -c "${opts.cwd}" '${cmd}'`,
      { stdio: "pipe" },
    );
    execSync(`tmux attach -t "${opts.name}"`, { stdio: "inherit" });
  }

  attachSession(name: string): void {
    execSync(`tmux attach -t "${name}"`, { stdio: "inherit" });
  }

  killSession(name: string): void {
    try {
      execFileSync("tmux", ["kill-session", "-t", name], { stdio: "pipe" });
    } catch {
      // session might not exist
    }
  }
}

function formatAgo(epoch: number): string {
  const diff = Math.floor(Date.now() / 1000) - epoch;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
