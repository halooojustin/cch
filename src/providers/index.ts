import { claudeProvider } from "./claude.js";
import { codexProvider } from "./codex.js";
import type { ProviderName, ProviderSelection, SessionProvider } from "./interface.js";

export const PROVIDERS: Record<ProviderName, SessionProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getProvider(name: ProviderName): SessionProvider {
  return PROVIDERS[name];
}

export function getProviders(selection: ProviderSelection): SessionProvider[] {
  if (selection === "all") {
    return [PROVIDERS.claude, PROVIDERS.codex];
  }

  return [PROVIDERS[selection]];
}
