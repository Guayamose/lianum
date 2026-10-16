/** Mechanical validation of retained DeFi source rows. DATA is never a permit. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const DEFI_TARGET_ROW_V8='ORIGINAL_PUBLIC_SEPOLIA_DEFI_TARGET_ROW_V8';
export const DEFI_COMMAND_ROW_V8='ORIGINAL_PUBLIC_SEPOLIA_DEFI_COMMAND_ROW_V8';
export const DEFI_APPROVAL_ROW_V8='ORIGINAL_PUBLIC_SEPOLIA_DEFI_APPROVAL_ROW_V8';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function sepoliaDefiTargetRowIdV8(protocol,plan,nonce){return digest(['ORIGINAL_DEFI_TARGET_V8',protocol,plan,nonce]);}
export function sepoliaDefiCommandRowIdV8(command){return digest(['ORIGINAL_DEFI_COMMAND_V8',command.protocol,command.descriptor.pairingId,command.jobId,command.kind]);}
export function sepoliaDefiApprovalRowIdV8(command){return digest(['ORIGINAL_DEFI_APPROVAL_V8',command.protocol,command.descriptor.pairingId,command.jobId,command.review.reference]);}
export function sepoliaDefiApprovalCallV8(command,plan){
 assert.equal(command.kind,'INVEST');const amount=BigInt(command.review.maximumInputAtomic);assert.ok(amount>0n&&amount<1n<<128n);return{to:plan.target.pools[0].asset,value:'0',data:'0x095ea7b3'+plan.delivery.address.slice(2).padStart(64,'0')+amount.toString(16).padStart(64,'0')};
}
export function sepoliaDefiProtocolV8(command){
 const protocol=command.profile==='ORIGINAL_AAVE_SEPOLIA_INITIALIZATION_V4'?'AAVE_STATIC':command.profile==='ORIGINAL_MORPHO_V2_SEPOLIA_INITIALIZATION_V4'?'MORPHO_V2':null;
 assert.ok(protocol,'SEPOLIA_DEFI_INITIALIZATION_PROFILE');return protocol;
}
export function validateSepoliaDefiInitializationDataV8(command,account){
 const protocol=sepoliaDefiProtocolV8(command),prefix=protocol==='AAVE_STATIC'?'AAVE':'MORPHO_V2',p=command.plan;
 assert.deepEqual(Object.keys(command).sort(),['profile','plan','index','kind','request'].sort());
 assert.equal(p.profile,'ORIGINAL_'+prefix+'_SEPOLIA_TARGET_PLAN_V4');assert.equal(p.chainId,'11155111');assert.equal(p.account,account);
 const {planSHA256,...unsigned}=p;assert.equal(createHash('sha256').update(canonical(unsigned)).digest('hex'),planSHA256,'SEPOLIA_DEFI_DURABLE_PLAN');
 assert.equal(p.constructors.length,5);assert.equal(p.postDeploymentCalls.length,2);assert.ok(Number.isSafeInteger(command.index)&&command.index>=0&&command.index<7);
 const expected=command.index<5?p.constructors[command.index]:p.postDeploymentCalls[command.index-5];assert.deepEqual(command.request,expected);assert.equal(command.kind,command.index<5?'CREATE':'CALL');
 assert.equal(command.request.nonce,(BigInt(p.startNonce)+BigInt(command.index)).toString());
 if(command.kind==='CALL'){assert.equal(command.request.from,account);assert.equal(command.request.to,p.target.hub.address);assert.equal(command.request.value,'0');assert.equal(command.request.pool,p.target.pools[command.index-5].address);assert.match(command.request.data,/^0x[0-9a-f]{72}$/);assert.equal(command.request.data.slice(-40),command.request.pool.slice(2));}
 return protocol;
}
/** The checkpoints change when the one-use authority consumes its command.
 * Every destination, byte, amount and signed review must remain identical. */
export function sameSepoliaDefiCommandTermsV8(before,after){
 const immutable=raw=>{const {journalRevision,journalDataSHA256,...terms}=raw;return terms;};
 assert.deepEqual(immutable(before),immutable(after),'SEPOLIA_DEFI_COMMAND_TERMS_CHANGED');
}
export function validateSepoliaDefiFinancialDataV8(command,account,plan){
 assert.equal(command.profile,'ORIGINAL_SEPOLIA_DEFI_FINANCIAL_COMMAND_V4');assert.ok(['AAVE_STATIC','MORPHO_V2'].includes(command.protocol));assert.ok(['INVEST','WITHDRAW','REDEEM'].includes(command.kind));
 assert.equal(command.from,account);assert.equal(command.value,'0');assert.match(command.data,/^0x(?:[0-9a-f]{2})+$/);assert.match(command.jobId,/^[0-9a-f]{64}$/);
 assert.equal(command.review.protocol,command.protocol);assert.equal(command.descriptor.poolTerms.scope,plan.target.pools[1].domain.scope);
 const destination=command.kind==='INVEST'?plan.delivery.address:command.kind==='REDEEM'?plan.exit.address:plan.target.pools[1].address;
 assert.equal(command.to,destination,'SEPOLIA_DEFI_FIXED_FINANCIAL_DESTINATION');assert.ok(Number.isSafeInteger(command.journalRevision)&&command.journalRevision>=0);assert.match(command.journalDataSHA256,/^[0-9a-f]{64}$/);
 return command;
}

/** Immutable economic handoff persisted BEFORE a key is used. It remains DATA;
 * only CapitalOwner can mint the corresponding live one-use permission. */
export function validateSepoliaDefiCapitalDataV8(capital,grant,plan){
 assert.equal(capital.profile,'ORIGINAL_SEPOLIA_DEFI_CAPITAL_COMMAND_V8');
 for(const [key,expected] of Object.entries({protocol:grant.protocol,jobId:grant.jobId,reference:grant.review.reference,targetPlanSHA256:plan.planSHA256}))assert.equal(capital[key],expected,'SEPOLIA_DEFI_CAPITAL_DURABLE_BINDING');
 assert.deepEqual(capital.dispatch,{id:capital.id,authorizationRoot:capital.authorizationRoot,actionCommitment:capital.actionCommitment});
 for(const value of [capital.authorizationRoot,capital.actionCommitment,capital.quoteTermsSHA256])assert.match(value,/^[0-9a-f]{64}$/);
 assert.equal(capital.delivery.profile,'PUBLIC_SEPOLIA_DEFI_PAGED_DELIVERY_DATA_V8');assert.equal(capital.delivery.protocol,grant.protocol);assert.equal(capital.delivery.context.targetPlanSHA256,plan.planSHA256);assert.match(capital.delivery.encodedDescriptor,/^[0-9a-f]{64}$/);
 assert.equal(capital.inputCeiling.amountAtomic,grant.review.maximumInputAtomic);assert.ok(BigInt(capital.payout.amountAtomic)>0n&&BigInt(capital.payout.amountAtomic)<=BigInt(capital.budget));
 return capital;
}
