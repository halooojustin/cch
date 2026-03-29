import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionBackend, ActiveSession, CreateSessionOpts } from "./interface.js";

export class ZellijBackend implements SessionBackend {
  name = "zellij";

  isAvailable(): boolean {
    try {
      execFileSync("which", ["zellij"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): ActiveSession[] {
    try {
      const raw = execFileSync("zellij", ["ls"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
          const name = clean.split(/\s+/)[0];
          const hasExited = clean.includes("EXITED");
          const createdMatch = clean.match(/Created\s+(.+?)\s*ago/);
          const created = createdMatch ? createdMatch[1] + " ago" : "";
          return {
            name,
            created,
            status: hasExited ? "exited" as const : "running" as const,
          };
        })
        .filter((s) => s.name);
    } catch {
      return [];
    }
  }

  createSession(opts: CreateSessionOpts): void {
    const dir = join(tmpdir(), "cch-zellij");
    mkdirSync(dir, { recursive: true });

    const safeArgs = opts.args.map((a) => `"${a}"`).join(" ");
    const layoutPath = join(dir, `${opts.name}-layout.kdl`);
    const configPath = join(dir, `${opts.name}-config.kdl`);

    writeFileSync(
      layoutPath,
      `layout {\n    pane command="${opts.command}" cwd="${opts.cwd}" {\n        args ${safeArgs}\n    }\n}\n`,
    );

    writeFileSync(
      configPath,
      `session_name "${opts.name}"\nattach_to_session true\ndefault_layout "${layoutPath}"\n`,
    );

    execSync(`zellij --config "${configPath}"`, { stdio: "inherit" });
  }

  attachSession(name: string): void {
    execSync(`zellij attach "${name}"`, { stdio: "inherit" });
  }

  killSession(name: string): void {
    try {
      execFileSync("zellij", ["kill-session", name], { stdio: "pipe" });
    } catch {
      // session might not exist
    }
  }
}
