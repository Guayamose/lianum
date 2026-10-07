/** A bounded display commitment only. This module never mints an action
 * capability or authorizes a proof, signature or send. The fixed service must
 * derive every fact from its original private owners/journals, rederive it at
 * admission, and revalidate after awaits before any effect. Numeric head fields follow the original reader uint64 domain; mutation
 * counter review is explicitly bounded to uint256. Errors carry only constant
 * labels, never malformed private inputs. Not yet API joined. */
import {createHash} from 'node:crypto';
import {types,isDeepStrictEqual} from 'node:util';
const need=(value,code='WRAPPED_RESUME_REVIEW_INVALID')=>{if(!value)throw Object.assign(new Error(code),{code});};
const assert={ok:need,equal:(a,b,code)=>need(Object.is(a,b),code),notEqual:(a,b,code)=>need(!Object.is(a,b),code),deepEqual:(a,b,code)=>need(isDeepStrictEqual(a,b),code)};
const match=(value,pattern)=>typeof value==='string'&&pattern.exec(value)?.[0]===value;
const h=value=>match(value,/^[0-9a-f]{64}$/),address=value=>match(value,/^0x[0-9a-f]{40}$/),number=(value,bits)=>typeof value==='string'&&value.length<=(bits===64?20:78)&&match(value,/^(0|[1-9][0-9]*)$/)&&BigInt(value)<(1n<<BigInt(bits));
function record(value,keys){assert.ok(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'WRAPPED_RESUME_REVIEW_RECORD');const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);need(names.every(key=>typeof key==='string'),'WRAPPED_RESUME_REVIEW_DATA_ONLY');assert.deepEqual(names.sort(),[...keys].sort());for(const key of keys)assert.ok(Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable,'WRAPPED_RESUME_REVIEW_DATA_ONLY');}
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function describeWrappedWithdrawalResumeReviewV1(input){
 record(input,['requestId','role','noteCommitment','canonicalNullifier','pool','assetId','amount','recipient','registryCommitment','claimAuthority','originalActorIdentitySHA256','signedTermsSHA256','authorizationJobSHA256','walletCheckpoint','signerCheckpoint','head','mutationEpoch','nativeJournalSHA256','actor','proof','registryPending','broadcastStarted']);
 assert.ok(match(input.requestId,/^[A-Za-z0-9_-]{8,100}$/));assert.ok(['change','recipient'].includes(input.role));
 for(const key of ['noteCommitment','canonicalNullifier','assetId','registryCommitment','originalActorIdentitySHA256','signedTermsSHA256','authorizationJobSHA256','nativeJournalSHA256'])assert.ok(h(input[key]),'WRAPPED_RESUME_REVIEW_HASH');
 for(const key of ['pool','recipient','claimAuthority'])assert.ok(address(input[key])&&input[key]!=='0x'+'0'.repeat(40),'WRAPPED_RESUME_REVIEW_ADDRESS');
 assert.notEqual(input.pool,input.recipient);assert.ok(number(input.amount,64)&&BigInt(input.amount)>0n);assert.ok(number(input.mutationEpoch,256));
 record(input.walletCheckpoint,['revision','commitment']);record(input.signerCheckpoint,['revision','stateSHA256']);
 for(const checkpoint of [input.walletCheckpoint,input.signerCheckpoint])assert.ok(Number.isSafeInteger(checkpoint.revision)&&checkpoint.revision>=0);
 assert.ok(h(input.walletCheckpoint.commitment)&&h(input.signerCheckpoint.stateSHA256));
 record(input.head,['number','hash','timestamp']);assert.ok(number(input.head.number,64)&&number(input.head.timestamp,64)&&h(input.head.hash));
 if(input.role==='change'){record(input.actor,['kind','processIdentitySHA256','generation']);assert.equal(input.actor.kind,'CURRENT_ORIGINAL_WRAPPED_OWNER');}
 else{record(input.actor,['kind','processIdentitySHA256','generation','pid','lifetimeIdentity']);assert.equal(input.actor.kind,'CURRENT_ORIGINAL_WRAPPED_RECIPIENT');assert.ok(Number.isSafeInteger(input.actor.pid)&&input.actor.pid>0&&input.actor.pid<=2147483647&&h(input.actor.lifetimeIdentity));}
 assert.ok(h(input.actor.processIdentitySHA256)&&Number.isSafeInteger(input.actor.generation)&&input.actor.generation>0);
 record(input.proof,['retained','proofSHA256','calldataSHA256']);assert.equal(typeof input.proof.retained,'boolean');
 if(input.proof.retained)assert.ok(h(input.proof.proofSHA256)&&h(input.proof.calldataSHA256));else{assert.equal(input.proof.proofSHA256,null);assert.equal(input.proof.calldataSHA256,null);}
 assert.equal(input.registryPending,false,'WRAPPED_RESUME_REVIEW_PENDING_CHECKPOINT');assert.equal(input.broadcastStarted,false,'WRAPPED_RESUME_REVIEW_ORIGINAL_BROADCAST_ARMED');
 const review=freeze({version:1,profile:'ORIGINAL_WRAPPED_WITHDRAWAL_PROOF_RESUME_REVIEW_V1',action:'RESUME_ORIGINAL_WITHDRAWAL_WITHOUT_RESIGNING',
  requestId:input.requestId,role:input.role,noteCommitment:input.noteCommitment,canonicalNullifier:input.canonicalNullifier,pool:input.pool,assetId:input.assetId,amount:input.amount,recipient:input.recipient,registryCommitment:input.registryCommitment,claimAuthority:input.claimAuthority,
  originalActorIdentitySHA256:input.originalActorIdentitySHA256,signedTermsSHA256:input.signedTermsSHA256,authorizationJobSHA256:input.authorizationJobSHA256,
  walletCheckpoint:{...input.walletCheckpoint},signerCheckpoint:{...input.signerCheckpoint},head:{...input.head},mutationEpoch:input.mutationEpoch,nativeJournalSHA256:input.nativeJournalSHA256,actor:{...input.actor},proof:{...input.proof},
  work:input.proof.retained?'BROADCAST_EXACT_RETAINED_PROOF':'REBUILD_EXACT_RETAINED_JOB_AND_BROADCAST',registryPending:false,broadcastStarted:false,effectPermission:false});
 const wire=canonical(review);assert.ok(Buffer.byteLength(wire)<=4096,'WRAPPED_RESUME_REVIEW_LIMIT');
 return Object.freeze({review,resumeSHA256:createHash('sha256').update(wire).digest('hex'),effectPermission:false});
}
