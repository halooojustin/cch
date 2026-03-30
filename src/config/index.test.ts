import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
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
