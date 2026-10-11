/** Fixed public owner relation and retained official Noir verifier source. */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {legacyDataRoot} from '@lianum/environment';
export const PROFILE='LIANUM_PAEG_FUNDED_4_V1';
export const OFFICIAL_VERIFIER=pathToFileURL(join(legacyDataRoot('engine'),'experiments/pc5-proof-probe/circuits/recursive_join/src/bb_proof_verification.nr'));
