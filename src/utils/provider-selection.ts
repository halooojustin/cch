import type { ProviderName, ProviderSelection } from "../providers/interface.js";

export interface BareQueryArgs {
  provider: ProviderSelection;
  query: string;
  showSubagents: boolean;
}

export function isProviderName(value: string): value is ProviderName {
  return value === "claude" || value === "codex";
}

export function isProviderSelection(value: string): value is ProviderSelection {
  return isProviderName(value) || value === "all";
}

export function parseProviderName(value: string | undefined, fallback: ProviderName): ProviderName {
  if (!value) return fallback;
  if (!isProviderName(value)) throw new Error(`Invalid defaultProvider: ${value}`);
  return value;
}

export function parseProviderSelection(
  value: string | undefined,
  fallback: ProviderSelection,
): ProviderSelection {
  if (!value) return fallback;
  if (!isProviderSelection(value)) throw new Error(`Invalid provider: ${value}`);
  return value;
}

export function parseBareQueryArgs(
  args: string[],
  fallback: ProviderSelection,
): BareQueryArgs {
  let provider = fallback;
  let showSubagents = false;
  let remaining = args;

  // parse --provider and --show-subagents flags in any order
  while (remaining.length > 0) {
    const arg = remaining[0];
    if (arg === "--provider") {
      if (!remaining[1]) {
        throw new Error("Missing value for --provider");
      }
      provider = parseProviderSelection(remaining[1], fallback);
      remaining = remaining.slice(2);
    } else if (arg?.startsWith("--provider=")) {
      provider = parseProviderSelection(arg.slice("--provider=".length), fallback);
      remaining = remaining.slice(1);
    } else if (arg === "--show-subagents") {
      showSubagents = true;
      remaining = remaining.slice(1);
    } else {
      break;
    }
  }

  const query = remaining.join(" ").trim();
  if (!query) {
    throw new Error("Missing query");
  }

  return { provider, query, showSubagents };
}
