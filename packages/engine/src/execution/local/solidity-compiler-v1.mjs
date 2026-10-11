/** Original local Solidity toolchain. Its fixed resource location, lock,
 * package origin/integrity, module bytes and full compiler version are checked
 * before use. This tool grants no deployment, proof or runtime authority.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, sep } from "node:path";
import { resourcePath } from "@lianum/environment";

export const GENERIC_COMPILER_PIN = Object.freeze({
  version: "0.8.37+commit.f401782d.Emscripten.clang",
  packageVersion: "0.8.37",
  resolved: "https://registry.npmjs.org/solc/-/solc-0.8.37.tgz",
  integrity:
    "sha512-ieUYdPDRGNKMsZpCfi9tY64Q+ASoL8tyhLuvf9cFiqDs+6ijlx8Wn2CRi0N71AlCvRx0V092rlUYu3b3PuxWlA==",
  lockSHA256:
    "01676bb5abe650970edb26246286dec92d8ce05d38c797723e129f4814b369c4",
  soljsonSHA256:
    "221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c",
});
/** @param {Buffer} bytes */
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {unknown} value @returns {asserts value is Record<string,unknown>} */
function record(value) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "GENERIC_SOLC_LOCK_SCHEMA",
  );
}

export function loadOriginalSolidityCompilerV1() {
  assert.equal(arguments.length, 0, "GENERIC_SOLC_FIXED_RESOURCES");
  const tools = realpathSync(resourcePath("engine", "tools/solidity-js"));
  const lock = readFileSync(join(tools, "package-lock.json"));
  assert.equal(
    sha(lock),
    GENERIC_COMPILER_PIN.lockSHA256,
    "GENERIC_SOLC_LOCK_HASH",
  );
  /** @type {unknown} */
  const parsed = JSON.parse(lock.toString("utf8"));
  record(parsed);
  const packages = parsed.packages;
  record(packages);
  const dependency = packages["node_modules/solc"];
  record(dependency);
  assert.equal(
    dependency.version,
    GENERIC_COMPILER_PIN.packageVersion,
    "GENERIC_SOLC_VERSION_PIN",
  );
  assert.equal(
    dependency.resolved,
    GENERIC_COMPILER_PIN.resolved,
    "GENERIC_SOLC_ORIGIN_PIN",
  );
  assert.equal(
    dependency.integrity,
    GENERIC_COMPILER_PIN.integrity,
    "GENERIC_SOLC_INTEGRITY_PIN",
  );
  const modulePath = realpathSync(join(tools, "node_modules/solc/soljson.js"));
  assert.ok(modulePath.startsWith(tools + sep), "GENERIC_SOLC_PATH_ESCAPE");
  assert.equal(
    sha(readFileSync(modulePath)),
    GENERIC_COMPILER_PIN.soljsonSHA256,
    "GENERIC_SOLJSON_HASH",
  );
  /** @type {unknown} */
  const module = createRequire(join(tools, "package.json"))(modulePath);
  record(module);
  assert.equal(typeof module.cwrap, "function", "GENERIC_SOLC_C_API");
  const method = module.cwrap;
  assert.ok(typeof method === "function");
  const cwrap = method.bind(module);
  const readVersion = cwrap("solidity_version", "string", []);
  assert.equal(typeof readVersion, "function", "GENERIC_SOLC_C_API");
  const version = readVersion();
  assert.equal(version, GENERIC_COMPILER_PIN.version, "GENERIC_SOLC_BUILD");
  const compile = cwrap("solidity_compile", "string", [
    "string",
    "number",
    "number",
  ]);
  const reset = cwrap("solidity_reset", null, []);
  assert.ok(
    typeof compile === "function" && typeof reset === "function",
    "GENERIC_SOLC_C_API",
  );
  return Object.freeze({
    version: GENERIC_COMPILER_PIN.version,
    /** @param {string} standardJSON */
    compile(standardJSON) {
      assert.equal(arguments.length, 1, "GENERIC_SOLC_STANDARD_JSON");
      assert.equal(typeof standardJSON, "string", "GENERIC_SOLC_STANDARD_JSON");
      try {
        const result = compile(standardJSON, 0, 0);
        assert.equal(typeof result, "string", "GENERIC_SOLC_OUTPUT");
        assert.ok(typeof result === "string");
        return result;
      } finally {
        reset();
      }
    },
  });
}
