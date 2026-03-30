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
  excludeDirs: string[];
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
  excludeDirs: ["claude-mem"],
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

// 进程内缓存：CLI 短生命周期，每个文件只需读一次
let configCache: CchConfig | null = null;

export function getConfig(): CchConfig {
  if (!configCache) {
    configCache = { ...DEFAULT_CONFIG, ...readJson<Partial<CchConfig>>(CONFIG_FILE, {}) };
  }
  return configCache;
}

export function setConfig(key: string, value: string): void {
  const config = readJson<Record<string, unknown>>(CONFIG_FILE, {});
  if (key === "claudeArgs" || key === "excludeDirs") {
    config[key] = value.split(",").map((s) => s.trim());
  } else if (key === "historyLimit") {
    config[key] = parseInt(value, 10);
  } else {
    config[key] = value;
  }
  writeJson(CONFIG_FILE, config);
  configCache = null; // 写入后清除缓存
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

let cacheData: Record<string, unknown> | null = null;

export function getCache(): Record<string, unknown> {
  if (!cacheData) {
    cacheData = readJson<Record<string, unknown>>(CACHE_FILE, {});
  }
  return cacheData;
}

export function writeCache(data: Record<string, unknown>): void {
  // 简单比较：key 数量相同且引用未变则跳过
  if (cacheData && JSON.stringify(cacheData) === JSON.stringify(data)) return;
  cacheData = data;
  writeJson(CACHE_FILE, data);
}

export { CONFIG_DIR };
