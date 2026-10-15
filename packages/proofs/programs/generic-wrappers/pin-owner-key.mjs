/** Historical entry; current operational implementation has one owner. */
export * from '../../src/verification/owner-key.mjs';
import {fileURLToPath} from 'node:url';
import {runOwnerPinCommandV1} from '../../src/verification/owner-key.mjs';
if (process.argv[1] === fileURLToPath(import.meta.url)) runOwnerPinCommandV1(process.argv.slice(2));
