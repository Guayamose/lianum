/** Recover the SAME unpublished empty child after a signed period extension.
 * Existing OWNER/Source/intent ciphertext is never retired or rewritten. The
 * result is authenticated DATA, not a Source permission or an execution token. */
import assert from 'node:assert/strict';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {assertPagedEmptySourceRecordDataV9} from '../recovery/paged-empty-source-replacement-data-v9.mjs';
import {readOriginalDevicePagedOwnerEmptyReplacementCheckpointV9} from './device-paged-owner-retention-v3.mjs';
import {assertPagedEmptyIntentPeriodExtensionV13} from './paged-empty-unissued-intent-recovery-v13.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function physical(path){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600&&s.size<=2097152&&await realpath(path)===path,'EMPTY_REPLACEMENT_OWNED_PRIVATE_FILE');}
async function unlocked(path){try{await lstat(path+'.lock');}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error('EMPTY_REPLACEMENT_OWNED_LOCKED');}
export async function readOwnedPagedEmptyIntentV15({intentVault,intent,password,journalPath,nextIntent,financialHistory,assertCurrent}){
 const ownerPath=join(dirname(journalPath),'private-owner.vault');
 try{await lstat(ownerPath);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 // Restoring the old child keeps its old quota. Any larger current quota must
 // already be in the Original runtime's signed history; this reader grants none.
 assertPagedEmptyIntentPeriodExtensionV13({intent,nextIntent,financialHistory},true);
 const files=[intentVault.path,journalPath,ownerPath],before=new Map();
 for(const path of files){await unlocked(path);await physical(path);before.set(path,sha(await readFile(path)));}
 assert.deepEqual(await intentVault.read(password),intent,'EMPTY_REPLACEMENT_OWNED_INTENT_CHANGED');
 const child=assertPagedEmptySourceRecordDataV9(await new Vault(journalPath).read(password));
 assert.equal(child.revision,0,'EMPTY_REPLACEMENT_OWNED_CHILD_ADVANCED');assert.equal(child.data.identity,intent.data.identity,'EMPTY_REPLACEMENT_OWNED_IDENTITY');assert.deepEqual(child.data.descriptor,intent.data.descriptor,'EMPTY_REPLACEMENT_OWNED_DESCRIPTOR');assert.deepEqual(child.data.emptyReplacementV9,intent.data.lineage,'EMPTY_REPLACEMENT_OWNED_LINEAGE');
 const owner=await readOriginalDevicePagedOwnerEmptyReplacementCheckpointV9({path:ownerPath,password:sha(Buffer.from('LIANUM/PAGED/OWNER-RETENTION/V3\0'+password+'\0'+child.data.descriptor.pairingId))},child.data.descriptor);
 assert.equal(owner.revision,0,'EMPTY_REPLACEMENT_OWNED_OWNER_ADVANCED');
 await assertCurrent();
 for(const[path,digest]of before){await unlocked(path);await physical(path);assert.equal(sha(await readFile(path)),digest,'EMPTY_REPLACEMENT_OWNED_FILES_CHANGED');}
 return Object.freeze({profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor:child.data.descriptor,identity:child.data.identity,journalRevision:child.revision,journalDataSHA256:sha(canonical(child.data)),ownerCheckpoint:owner});
}
