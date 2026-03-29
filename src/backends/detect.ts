import { execFileSync } from "node:child_process";
import { getConfig } from "../config/index.js";
import type { SessionBackend } from "./interface.js";

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function detectBackend(): Promise<SessionBackend> {
  const config = getConfig();

  if (config.backend === "zellij" || (config.backend === "auto" && commandExists("zellij"))) {
    const { ZellijBackend } = await import("./zellij.js");
    return new ZellijBackend();
  }

  if (config.backend === "tmux" || (config.backend === "auto" && commandExists("tmux"))) {
    const { TmuxBackend } = await import("./tmux.js");
    return new TmuxBackend();
  }

  console.error("Error: No terminal multiplexer found. Please install Zellij or tmux.");
  console.error("  brew install zellij   # or");
  console.error("  brew install tmux");
  process.exit(1);
}
