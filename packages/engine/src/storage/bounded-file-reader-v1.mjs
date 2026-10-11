/** Bounded reads own FD lifetime and buffer wiping, without store keys or state. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";

/** @typedef {{ isFile(): boolean, isSymbolicLink(): boolean }} FileMetadata */
/** @typedef {{
 * stat(): Promise<{ isFile(): boolean, size: number }>,
 * read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>,
 * close(): Promise<void>
 * }} ReadHandle */
/** @typedef {{
 * lstat(path: string): Promise<FileMetadata>,
 * open(path: string, flags: 'r'): Promise<ReadHandle>,
 * check(condition: unknown, code: string): void,
 * defaultMaximum: number
 * }} ReadPorts */

/** @param {ReadPorts} ports */
export function createBoundedFileReaderV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, ["lstat", "open", "check", "defaultMaximum"]);
  const { lstat, open, check, defaultMaximum } = ports;
  assert.ok(Number.isSafeInteger(defaultMaximum) && defaultMaximum > 0);
  for (const method of [lstat, open, check])
    assert.equal(typeof method, "function");
  /** @param {string} path @param {number} [maximum] */
  async function boundedRead(path, maximum = defaultMaximum) {
    const metadata = await lstat(path);
    check(
      metadata.isFile() && !metadata.isSymbolicLink(),
      "CLAIM_STORE_UNSAFE_FILE",
    );
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      check(stat.isFile() && stat.size <= maximum, "CLAIM_STORE_FILE_SIZE");
      // FD size selects allocation only, never the trusted read limit or EOF.
      // Tiny encrypted cells need not allocate/wipe the whole 2 MiB envelope
      // bound. A concurrent grow still reads/probes through the original max+1.
      let buffer = Buffer.alloc(
          Math.min(maximum + 1, Math.max(4096, stat.size + 1)),
        ),
        offset = 0;
      try {
        while (offset < maximum + 1) {
          if (offset === buffer.length) {
            const larger = Buffer.alloc(
              Math.min(maximum + 1, buffer.length * 2),
            );
            try {
              buffer.copy(larger, 0, 0, offset);
            } catch (error) {
              larger.fill(0);
              throw error;
            }
            buffer.fill(0);
            buffer = larger;
          }
          const { bytesRead } = await handle.read(
            buffer,
            offset,
            buffer.length - offset,
            offset,
          );
          if (!bytesRead) break;
          offset += bytesRead;
        }
        check(offset <= maximum, "CLAIM_STORE_FILE_SIZE");
        return buffer.subarray(0, offset).toString("utf8");
      } finally {
        buffer.fill(0);
      }
    } finally {
      await handle.close();
    }
  }
  return boundedRead;
}
