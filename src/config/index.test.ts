import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("getConfig returns the current Claude-first defaults", async () => {
  const originalHome = process.env.HOME;
  const tempHome = mkdtempSync(join(tmpdir(), "cch-config-"));
  const configModuleUrl = new URL(`./index.ts?smoke=${Date.now()}`, import.meta.url);

  process.env.HOME = tempHome;

  try {
    const { getConfig } = await import(configModuleUrl.href);

    assert.deepEqual(getConfig(), {
      backend: "auto",
      claudeCommand: "claude",
      claudeArgs: ["--dangerously-skip-permissions"],
      codexCommand: "codex",
      codexArgs: ["--no-alt-screen"],
      defaultProvider: "claude",
      historyLimit: 100,
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test("setConfig parses codexArgs as a list", async () => {
  const originalHome = process.env.HOME;
  const tempHome = mkdtempSync(join(tmpdir(), "cch-config-"));
  const configModuleUrl = new URL(`./index.ts?smoke=${Date.now()}`, import.meta.url);

  process.env.HOME = tempHome;

  try {
    const { setConfig } = await import(configModuleUrl.href);
    setConfig("codexArgs", "--foo, --bar");

    const stored = JSON.parse(readFileSync(join(tempHome, ".config", "cch", "config.json"), "utf-8"));

    assert.deepEqual(stored.codexArgs, ["--foo", "--bar"]);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test("setConfig persists defaultProvider when set to codex", async () => {
  const originalHome = process.env.HOME;
  const tempHome = mkdtempSync(join(tmpdir(), "cch-config-"));
  const configModuleUrl = new URL(`./index.ts?smoke=${Date.now()}`, import.meta.url);

  process.env.HOME = tempHome;

  try {
    const { getConfig, setConfig } = await import(configModuleUrl.href);
    setConfig("defaultProvider", "codex");

    const configPath = join(tempHome, ".config", "cch", "config.json");
    const stored = JSON.parse(readFileSync(configPath, "utf-8"));

    assert.equal(getConfig().defaultProvider, "codex");
    assert.equal(stored.defaultProvider, "codex");
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test("setConfig rejects invalid defaultProvider values", async () => {
  const originalHome = process.env.HOME;
  const tempHome = mkdtempSync(join(tmpdir(), "cch-config-"));
  const configModuleUrl = new URL(`./index.ts?smoke=${Date.now()}`, import.meta.url);

  process.env.HOME = tempHome;

  try {
    const { setConfig } = await import(configModuleUrl.href);
    const configPath = join(tempHome, ".config", "cch", "config.json");

    assert.throws(() => setConfig("defaultProvider", "all"), /Invalid defaultProvider/);
    assert.throws(() => setConfig("defaultProvider", "wizard"), /Invalid defaultProvider/);
    assert.equal(existsSync(configPath), false);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test("getConfig sanitizes invalid persisted defaultProvider values", async () => {
  const originalHome = process.env.HOME;
  const tempHome = mkdtempSync(join(tmpdir(), "cch-config-"));
  const configDir = join(tempHome, ".config", "cch");
  const configPath = join(configDir, "config.json");
  const configModuleUrl = new URL(`./index.ts?smoke=${Date.now()}`, import.meta.url);

  process.env.HOME = tempHome;

  try {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          defaultProvider: "all",
          codexCommand: "custom-codex",
        },
        null,
        2,
      ) + "\n",
    );

    const { getConfig } = await import(configModuleUrl.href);
    const config = getConfig();

    assert.equal(config.defaultProvider, "claude");
    assert.equal(config.codexCommand, "custom-codex");
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});
