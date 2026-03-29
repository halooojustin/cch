import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "cch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSIONS_FILE = join(CONFIG_DIR, "sessions.json");
const CACHE_FILE = join(CONFIG_DIR, "cache.json");

export interface CchConfig {
  backend: "auto" | "zellij" | "tmux";
  claudeCommand: string;
  claudeArgs: string[];
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
  return { ...DEFAULT_CONFIG, ...readJson<Partial<CchConfig>>(CONFIG_FILE, {}) };
}

export function setConfig(key: string, value: string): void {
  const config = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  if (key === "claudeArgs") {
    config[key] = value.split(",").map((s) => s.trim());
  } else if (key === "historyLimit") {
    config[key] = parseInt(value, 10);
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
