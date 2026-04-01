import { execFileSync } from "node:child_process";
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
    try {
      execFileSync("tmux", ["has-session", "-t", opts.name], { stdio: "pipe" });
      execFileSync("tmux", ["attach", "-t", opts.name], { stdio: "inherit" });
      return;
    } catch {
      // session doesn't exist, create it
    }

    // Create session with a plain shell, then send the full command via send-keys
    // This avoids shell quoting issues with JSON in --settings
    execFileSync("tmux", ["new-session", "-d", "-s", opts.name, "-c", opts.cwd], {
      stdio: "pipe",
    });

    // Build properly escaped command
    const parts = [opts.command, ...opts.args].map((a) => {
      if (/[{}"'\s]/.test(a)) return `'${a.replace(/'/g, "'\\''")}'`;
      return a;
    });
    execFileSync("tmux", ["send-keys", "-t", opts.name, parts.join(" "), "Enter"], {
      stdio: "pipe",
    });

    execFileSync("tmux", ["attach", "-t", opts.name], { stdio: "inherit" });
  }

  attachSession(name: string): void {
    execFileSync("tmux", ["attach", "-t", name], { stdio: "inherit" });
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
