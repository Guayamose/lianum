/** Historical entry; current operational implementation has one owner. */
export * from '../../../../packages/proofs/src/verification/native-key.mjs';
import {fileURLToPath} from 'node:url';
import {runNativePinCommandV1} from '../../../../packages/proofs/src/verification/native-key.mjs';
if (process.argv[1] === fileURLToPath(import.meta.url)) runNativePinCommandV1(process.argv.slice(2));
