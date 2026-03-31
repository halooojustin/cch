import { createNewSession, forceNewSession } from "../services/session.js";
import type { ProviderName } from "../providers/interface.js";

export async function newCommand(
  description: string | undefined,
  force: boolean,
  provider: ProviderName = "claude",
): Promise<void> {
  const cwd = process.cwd();
  if (force) {
    await forceNewSession(cwd, description, provider);
  } else {
    await createNewSession(cwd, description, provider);
  }
}
