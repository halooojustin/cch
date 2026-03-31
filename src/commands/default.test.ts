import { strict as assert } from "node:assert";
import test from "node:test";
import { parseBareQueryArgs } from "../utils/provider-selection.js";

test("bare ch parser accepts provider before natural-language query", () => {
  const parsed = parseBareQueryArgs(["--provider", "all", "cmux", "resume", "history"], "claude");

  assert.deepEqual(parsed, {
    provider: "all",
    query: "cmux resume history",
  });
});

test("bare ch parser keeps Claude as the default provider when omitted", () => {
  const parsed = parseBareQueryArgs(["login", "bug"], "claude");

  assert.deepEqual(parsed, {
    provider: "claude",
    query: "login bug",
  });
});

test("bare ch parser accepts equals syntax for provider", () => {
  const parsed = parseBareQueryArgs(["--provider=codex", "resume", "thread"], "claude");

  assert.deepEqual(parsed, {
    provider: "codex",
    query: "resume thread",
  });
});
