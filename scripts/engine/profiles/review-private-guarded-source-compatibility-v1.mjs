/** New public source-review package; never historical financial evidence. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {readPrivateGuardedSourceCompatibilityReviewV1} from '../../../packages/backend/src/payments/private-guarded-source-compatibility-v1.mjs';

assert.equal(process.argv.length,2,'SOURCE_REVIEW_NO_CALLER_CONFIGURATION');
const directory=join(projectRoot,'.local/source-compatibility-review',randomUUID());
await mkdir(directory,{recursive:true,mode:0o700});
const review=await readPrivateGuardedSourceCompatibilityReviewV1();
const bytes=Buffer.from(JSON.stringify(review,null,2)+'\n'),path=join(directory,'manifest.json');
await writeFile(path,bytes,{flag:'wx',mode:0o600});
assert.deepEqual(await readFile(path),bytes,'SOURCE_REVIEW_READBACK');
console.log(JSON.stringify({classification:review.classification,financialAcceptance:false,
 path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
