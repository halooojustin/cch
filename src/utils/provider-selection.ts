import type { ProviderName, ProviderSelection } from "../providers/interface.js";

export interface BareQueryArgs {
  provider: ProviderSelection;
  query: string;
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
  let queryArgs = args;

  const providerArg = args[0];
  if (providerArg === "--provider") {
    if (!args[1]) {
      throw new Error("Missing value for --provider");
    }
    provider = parseProviderSelection(args[1], fallback);
    queryArgs = args.slice(2);
  } else if (providerArg?.startsWith("--provider=")) {
    provider = parseProviderSelection(providerArg.slice("--provider=".length), fallback);
    queryArgs = args.slice(1);
  }

  const query = queryArgs.join(" ").trim();
  if (!query) {
    throw new Error("Missing query");
  }

  return { provider, query };
}
