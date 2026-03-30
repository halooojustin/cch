import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
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
