import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inputUint, inputPath } from "../src/plain-input.mjs";

test("canonical input quantities preserve zero, uint128 and the caller read-count cap", () => {
  assert.equal(inputUint("0"), 0n);
  assert.equal(
    inputUint("340282366920938463463374607431768211455", 128),
    (1n << 128n) - 1n,
  );
  assert.equal(inputUint("4096", 32, 4096n), 4096n);
  assert.throws(() => inputUint("4097", 32, 4096n), /INPUT_UINT_RANGE/);
  assert.throws(
    () => inputUint("340282366920938463463374607431768211456", 128),
    /INPUT_UINT_RANGE/,
  );
  for (const value of [
    undefined,
    null,
    0,
    0n,
    new String("1"),
    "01",
    "-1",
    "1.0",
    " 1",
    "1e6",
    "1".repeat(40),
  ])
    assert.throws(() => inputUint(value), /INPUT_UINT_(STRING|ENCODING)/);
});

test("exact Merkle input paths reject field overflow, index aliases and executable fields", () => {
  const path = {
    root: "00".repeat(32),
    index: 0,
    siblings: ["00".repeat(32), "01".repeat(32)],
  };
  assert.equal(inputPath(path, 2), path);
  assert.equal(inputPath(path, 2, true), path);
  for (const index of [-0, -1, 4, 0.5, "0"])
    assert.throws(() => inputPath({ ...path, index }, 2), /INPUT_PATH_INDEX/);
  assert.throws(() => inputPath({ ...path, siblings: [path.root] }, 2));
  assert.throws(() => inputPath({ ...path, root: "ff".repeat(32) }, 2, true));
  assert.throws(
    () => inputPath({ ...path, provider: () => assert.fail("CALLBACK") }, 2),
    /EXACT_FIELDS/,
  );
  const getter = { ...path };
  Object.defineProperty(getter, "index", {
    enumerable: true,
    get() {
      assert.fail("GETTER");
    },
  });
  assert.throws(() => inputPath(getter, 2), /DATA_FIELDS/);
});

test("common input readers load with filesystem access limited to components", () => {
  const module = new URL("../src/plain-input.mjs", import.meta.url),
    directory = fileURLToPath(new URL("../", import.meta.url));
  const script = `const m=await import(${JSON.stringify(module.href)}); if(m.inputUint('7')!==7n)throw Error('INPUT_RESULT'); console.log('COMPONENT_ONLY');`;
  const output = execFileSync(
    process.execPath,
    [
      "--permission",
      "--allow-fs-read=" + directory,
      "--input-type=module",
      "--eval",
      script,
    ],
    { cwd: "/", encoding: "utf8", timeout: 5000 },
  );
  assert.equal(output.trim(), "COMPONENT_ONLY");
});
