import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderName } from "../providers/interface.js";
import { isProviderName, parseProviderName } from "../utils/provider-selection.js";

const CONFIG_DIR = join(homedir(), ".config", "cch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSIONS_FILE = join(CONFIG_DIR, "sessions.json");
const CACHE_FILE = join(CONFIG_DIR, "cache.json");

export interface CchConfig {
  backend: "auto" | "zellij" | "tmux";
  claudeCommand: string;
  claudeArgs: string[];
  codexCommand: string;
  codexArgs: string[];
  defaultProvider: ProviderName;
  historyLimit: number;
}

export interface SessionMeta {
  description: string;
  cwd: string;
  createdAt: string;
}

const DEFAULT_CONFIG: CchConfig = {
  backend: "auto",
  claudeCommand: "claude",
  claudeArgs: ["--dangerously-skip-permissions"],
  codexCommand: "codex",
  codexArgs: ["--no-alt-screen"],
  defaultProvider: "claude",
  historyLimit: 100,
};

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function getConfig(): CchConfig {
  const config = readJson<Partial<CchConfig>>(CONFIG_FILE, {});
  const defaultProvider =
    typeof config.defaultProvider === "string" && isProviderName(config.defaultProvider)
      ? config.defaultProvider
      : DEFAULT_CONFIG.defaultProvider;

  return {
    ...DEFAULT_CONFIG,
    ...config,
    defaultProvider,
  };
}

export function setConfig(key: string, value: string): void {
  const config = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  if (key === "claudeArgs" || key === "codexArgs") {
    config[key] = value.split(",").map((s) => s.trim());
  } else if (key === "historyLimit") {
    config[key] = parseInt(value, 10);
  } else if (key === "defaultProvider") {
    config[key] = parseProviderName(value, DEFAULT_CONFIG.defaultProvider);
  } else {
    config[key] = value;
  }
  writeJson(CONFIG_FILE, config);
}

export function getSessionsMeta(): Record<string, SessionMeta> {
  return readJson<Record<string, SessionMeta>>(SESSIONS_FILE, {});
}

export function setSessionMeta(name: string, meta: SessionMeta): void {
  const sessions = getSessionsMeta();
  sessions[name] = meta;
  writeJson(SESSIONS_FILE, sessions);
}

export function removeSessionMeta(name: string): void {
  const sessions = getSessionsMeta();
  delete sessions[name];
  writeJson(SESSIONS_FILE, sessions);
}

export function getCache(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(CACHE_FILE, {});
}

export function writeCache(data: Record<string, unknown>): void {
  writeJson(CACHE_FILE, data);
}

export { CONFIG_DIR };
