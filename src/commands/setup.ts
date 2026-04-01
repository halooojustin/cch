import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const ALIASES = `
# cch — Claude Code History (https://github.com/halooojustin/cch)
alias cn="ch new"
alias cnf="ch new -f"
alias cls="ch ls"
alias cps="ch ps"
alias chs="ch search"
`;

const MARKER = "# cch — Claude Code History";

const TMUX_CONF = `# cch recommended settings
set -g mouse on
set -g allow-passthrough on
`;

const TMUX_MARKER = "# cch recommended settings";

function detectShellRc(): string {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return join(homedir(), ".zshrc");
  if (shell.includes("bash")) {
    const bashProfile = join(homedir(), ".bash_profile");
    if (existsSync(bashProfile)) return bashProfile;
    return join(homedir(), ".bashrc");
  }
  return join(homedir(), ".bashrc");
}

function setupTmux(): void {
  const tmuxConf = join(homedir(), ".tmux.conf");

  if (existsSync(tmuxConf)) {
    const content = readFileSync(tmuxConf, "utf-8");
    if (content.includes(TMUX_MARKER)) {
      console.log("  tmux: already configured");
      return;
    }
    appendFileSync(tmuxConf, "\n" + TMUX_CONF);
  } else {
    writeFileSync(tmuxConf, TMUX_CONF);
  }

  // Reload if tmux server is running
  try {
    execFileSync("tmux", ["source-file", tmuxConf], { stdio: "pipe" });
  } catch {
    // tmux not running, config will apply on next start
  }

  console.log("  tmux: mouse scroll + passthrough enabled (~/.tmux.conf)");
}

export function setupCommand(): void {
  const rcFile = detectShellRc();
  const rcName = rcFile.split("/").pop();

  // Shell aliases
  let aliasesInstalled = false;
  if (existsSync(rcFile)) {
    const content = readFileSync(rcFile, "utf-8");
    if (content.includes(MARKER)) {
      aliasesInstalled = true;
    }
  }

  if (!aliasesInstalled) {
    appendFileSync(rcFile, ALIASES);
  }

  // tmux config
  setupTmux();

  // Summary
  console.log("\nSetup complete:\n");
  if (aliasesInstalled) {
    console.log(`  Shell aliases: already in ~/${rcName}`);
  } else {
    console.log(`  Shell aliases added to ~/${rcName}:`);
    console.log("    cn   → ch new            Create new session");
    console.log("    cnf  → ch new -f         Force new session");
    console.log("    cls  → ch ls             Browse history");
    console.log("    cps  → ch ps             Active sessions");
    console.log("    chs  → ch search         Keyword search");
  }
  console.log("");
  if (!aliasesInstalled) {
    console.log(`Run: source ~/${rcName}`);
  }
}
