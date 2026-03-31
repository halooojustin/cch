import { getConfig, setConfig } from "../config/index.js";

export function configCommand(key?: string, value?: string): void {
  if (key && value) {
    try {
      setConfig(key, value);
      console.log(`Set ${key} = ${value}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    }
    return;
  }

  const config = getConfig();
  console.log("\nCCH Configuration (~/.config/cch/config.json):\n");
  for (const [k, v] of Object.entries(config)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
  console.log();
}
