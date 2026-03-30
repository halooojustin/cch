import type { ProviderName, ProviderSelection } from "../providers/interface.js";

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
