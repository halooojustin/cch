import { strict as assert } from "node:assert";
import test from "node:test";
import * as sessionModule from "./session.js";

const makeSessionName = sessionModule.makeSessionName as unknown as (
  cwd: string,
  description?: string,
  provider?: "claude" | "codex",
) => string;

test("Codex session names include a provider marker", () => {
  assert.equal(makeSessionName("/workspace/myproject", "fix auth", "codex"), "ch-cx-myproject-fix-auth");
});
