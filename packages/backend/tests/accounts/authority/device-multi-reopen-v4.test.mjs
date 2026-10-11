import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { legacyDataRoot } from "@lianum/environment";
const run = promisify(execFile);
const fixture = fileURLToPath(
  new URL("../../support/device-multi-reopen-host.mjs", import.meta.url),
);
for (const scenario of [
  "success",
  "routers",
  "provider-checkpoint",
  "pending-candidate",
])
  test(
    "canonical multi graph ordered recovery: " + scenario,
    { timeout: 60000 },
    async (t) => {
      const runId = randomUUID(),
        attempt = join(
          legacyDataRoot("wallet"),
          ".local/device-external-flat-ordered-observation-v1",
          "attempt-" + runId,
        ),
        directory = join(attempt, "private-audit");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      t.after(() => rm(attempt, { recursive: true, force: true }));
      const manifest = join(attempt, "host-input.json");
      await writeFile(
        manifest,
        JSON.stringify({
          directory,
          runId,
          sourceSHA256: "13".repeat(32),
          deadlineMs: Date.now() + 120000,
        }),
        { mode: 0o600 },
      );
      async function call(mode) {
        try {
          const { stdout } = await run(
            process.execPath,
            [
              "--experimental-test-module-mocks",
              fixture,
              mode,
              manifest,
              scenario,
            ],
            { timeout: 30000, maxBuffer: 1024 * 1024 },
          );
          return JSON.parse(stdout.trim());
        } catch (error) {
          assert.fail(error.stderr || error.message);
        }
      }
      const captured = await call("capture"),
        reopened = await call("reopen");
      assert.equal(captured.captured, true);
      assert.notEqual(captured.pid, reopened.pid);
      assert.equal(reopened.scenario, scenario);
      assert.equal(reopened.counts.proofs, 0);
      assert.equal(reopened.counts.sends, 0);
      assert.equal(
        reopened.counts.acquisitions,
        scenario === "success" ? 5 : 0,
      );
    },
  );
