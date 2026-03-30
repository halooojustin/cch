import type { ProviderSelection } from "../providers/interface.js";

export function isProviderSelection(value: string): value is ProviderSelection {
  return value === "claude" || value === "codex" || value === "all";
}

export function parseProviderSelection(
  value: string | undefined,
  fallback: ProviderSelection,
): ProviderSelection {
  if (!value) return fallback;
  if (!isProviderSelection(value)) throw new Error(`Invalid provider: ${value}`);
  return value;
}
