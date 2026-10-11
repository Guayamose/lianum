/** Exercise the complete reader with real files and controlled FD growth/IO. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBoundedFileReaderV1 } from "../../src/storage/bounded-file-reader-v1.mjs";
const isWiped = (buffer) => buffer.every((byte) => byte === 0);

test("original bounded read follows FD growth through EOF or max+1 and wipes buffers on overflow or IO failure", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "claim-v3-growth-"));
  async function run({ suffix, maximum, failRead = false, initial = "x" }) {
    const path = join(directory, crypto.randomBytes(8).toString("hex"));
    await fs.writeFile(path, initial);
    const allocations = [],
      ioError = Error("HOST_CONTROLLED_READ_FAILURE");
    let reads = 0,
      closed = 0,
      eof = false;
    const ports = {
      defaultMaximum: 2 * 1024 * 1024,
      check: (ok, code) => {
        if (!ok) throw Object.assign(Error(code), { code });
      },
      lstat: fs.lstat,
      async open(selected, flags) {
        assert.equal(selected, path);
        assert.equal(flags, "r");
        const handle = await fs.open(selected, flags);
        return {
          async stat() {
            const stat = await handle.stat();
            // Physical append after the original FD stat; size is not an EOF grant.
            if (suffix) await fs.appendFile(path, suffix);
            return stat;
          },
          async read(...args) {
            if (failRead && reads === 1) throw ioError;
            reads++;
            const result = await handle.read(...args);
            if (result.bytesRead === 0) eof = true;
            return result;
          },
          async close() {
            await handle.close();
            closed++;
          },
        };
      },
    };
    const actual = createBoundedFileReaderV1(ports);
    const actualAlloc = Buffer.alloc;
    const spy = mock.method(Buffer, "alloc", (size, ...rest) => {
      const value = actualAlloc(size, ...rest);
      allocations.push(value);
      return value;
    });
    let value, error;
    try {
      value = await actual(path, maximum);
    } catch (cause) {
      error = cause;
    } finally {
      spy.mock.restore();
    }
    assert.equal(closed, 1);
    assert.ok(allocations.every(isWiped));
    assert.ok(allocations.every((buffer) => buffer.length <= maximum + 1));
    return { value, error, ioError, reads, eof, allocations };
  }
  try {
    const suffix = "é".repeat(40_000);
    const grown = await run({ suffix, maximum: 100_000 });
    assert.equal(grown.value, "x" + suffix);
    assert.equal(grown.error, undefined);
    assert.equal(grown.eof, true);
    assert.ok(
      grown.allocations.length > 1 && grown.allocations[0].length === 4096,
    );
    const exact = await run({ suffix: "y".repeat(98_303), maximum: 98_304 });
    assert.equal(exact.value.length, 98_304);
    assert.equal(exact.eof, true);
    const overflow = await run({ suffix: "z".repeat(128), maximum: 128 });
    assert.equal(overflow.error.code, "CLAIM_STORE_FILE_SIZE");
    assert.equal(overflow.value, undefined);
    const failed = await run({
      suffix: "k".repeat(8_000),
      maximum: 10_000,
      failRead: true,
    });
    assert.equal(failed.error, failed.ioError);
    assert.equal(failed.value, undefined);
    assert.ok(failed.allocations.length > 1);
    const before = await run({ initial: "a".repeat(129), maximum: 128 });
    assert.equal(before.error.code, "CLAIM_STORE_FILE_SIZE");
    assert.equal(before.allocations.length, 0);
    assert.equal(before.reads, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
