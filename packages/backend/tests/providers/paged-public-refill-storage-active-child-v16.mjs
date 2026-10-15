/** Explicit inert fixture publisher. The caller waits for process death before
 * exercising the original ACTIVE supervisor fence. No chain or financial work. */
import {readFile,writeFile} from 'node:fs/promises';
import * as R from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const owner=await R.createOriginalPagedPublicSupervisorRetentionV4(input.location,input.descriptor);
try{await owner.publishActivationBaseV4(input.snapshot);await writeFile(input.result,JSON.stringify(owner.checkpoint()),{mode:0o600});}finally{await owner.close();}
