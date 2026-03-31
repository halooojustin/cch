import { Command } from "commander";
import { lsCommand } from "./commands/ls.js";
import { searchCommand } from "./commands/search.js";
import { defaultCommand } from "./commands/default.js";
import { newCommand } from "./commands/new.js";
import { psCommand } from "./commands/ps.js";
import { attachCommand } from "./commands/attach.js";
import { killCommand } from "./commands/kill.js";
import { resumeCommand } from "./commands/resume.js";
import { configCommand } from "./commands/config.js";
import { setupCommand } from "./commands/setup.js";
import { loadSessions } from "./services/history.js";
import { formatSessionLines } from "./ui/format.js";
import { parseBareQueryArgs, parseProviderName, parseProviderSelection } from "./utils/provider-selection.js";

const program = new Command();

program
  .name("ch")
  .description("Claude Code History — manage conversation history across projects")
  .version("0.1.0");

program
  .command("ls")
  .description("List recent conversation history")
  .option("-n, --number <n>", "Number of sessions to show", "20")
  .option("--provider <provider>", "claude | codex | all", "claude")
  .action(async (opts) => lsCommand(
    parseInt(opts.number, 10),
    parseProviderSelection(opts.provider, "claude"),
  ));

program
  .command("search <keyword>")
  .description("Search sessions by keyword")
  .option("--provider <provider>", "claude | codex | all", "claude")
  .action((keyword, opts) => searchCommand(
    keyword,
    parseProviderSelection(opts.provider, "claude"),
  ));

program
  .command("new [description...]")
  .description("Create a new Claude session in current directory")
  .option("-f, --force", "Kill existing session with same name first")
  .option("--provider <provider>", "claude | codex", "claude")
  .action((desc, opts) => newCommand(
    desc?.join(" ") || undefined,
    opts.force || false,
    parseProviderName(opts.provider, "claude"),
  ));

program
  .command("ps")
  .description("List active multiplexer sessions")
  .action(() => psCommand());

program
  .command("attach <name>")
  .description("Attach to an active multiplexer session")
  .action((name) => attachCommand(name));

program
  .command("kill <name>")
  .description("Kill a multiplexer session")
  .action((name) => killCommand(name));

program
  .command("resume <sessionId>")
  .description("Resume a session by ID in multiplexer")
  .option("--provider <provider>", "claude | codex | all", "all")
  .action((id, opts) => resumeCommand(
    id,
    parseProviderSelection(opts.provider, "all"),
  ));

program
  .command("config [key] [value]")
  .description("Show or set configuration")
  .action((key, value) => configCommand(key, value));

program
  .command("setup")
  .description("Install shell aliases (cn, cnf, cls, cps, chs)")
  .action(() => setupCommand());

// Default behavior: no subcommand → show help + recent sessions
// Unknown args → treat as natural language search
const known = ["ls", "search", "new", "ps", "attach", "kill", "resume", "config", "setup", "help"];
const args = process.argv.slice(2);

if (args.length === 0) {
  program.outputHelp();
  console.log("\nRecent sessions:");
  const recent = loadSessions("claude", 5);
  if (recent.length) {
    const lines = formatSessionLines(recent, "claude");
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log("\nRun `ch ls` to browse all history.");
  } else {
    console.log("  No history found.");
  }
} else {
  const looksLikeBareQuery = !known.includes(args[0])
    && (!args[0].startsWith("-") || args[0] === "--provider" || args[0].startsWith("--provider="));

  if (looksLikeBareQuery) {
    try {
      const parsed = parseBareQueryArgs(args, "claude");
      await defaultCommand(parsed.query, parsed.provider);
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  } else {
    await program.parseAsync();
  }
}
