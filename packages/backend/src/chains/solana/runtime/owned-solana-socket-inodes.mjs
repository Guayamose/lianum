/** Private fresh-read helper for the owned Solana socket inspection. The bound
 * applies per inspection; no descriptor, inode or in-flight work is shared. */
import { readdir, readlink } from 'node:fs/promises';
import { join } from 'node:path';

const FD_READ_WORKERS = 16;

export async function readOwnedSolanaSocketInodes(directory) {
  const names = await readdir(directory), inodes = new Set();
  let next = 0, failureIndex = names.length, failure;
  async function worker() {
    while (next < names.length) {
      const index = next++;
      try {
        const target = await readlink(join(directory, names[index]));
        const match = /^socket:\[([0-9]+)\]$/.exec(target);
        if (match) inodes.add(match[1]);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        // Read every enumerated FD even after a failure. Completion order must
        // neither suppress a denial nor choose which original error escapes.
        if (index < failureIndex) { failureIndex = index; failure = error; }
      }
    }
  }
  // Workers retain their errors until ALL fresh reads have settled, so no
  // started read outlives a successful inspection or its rejection.
  await Promise.all(Array.from({ length: Math.min(FD_READ_WORKERS, names.length) }, worker));
  if (failureIndex < names.length) throw failure;
  return inodes;
}
