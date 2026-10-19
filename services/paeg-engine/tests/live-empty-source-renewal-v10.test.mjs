/** HOST lifecycle and scope guards. The Original product is a private stand-in;
 * actual filesystem journals are used. No signing, chain or financial acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),h=n=>n.toString(16).padStart(2,'0').repeat(32),files=new Map(),stateDirectory='/HOST/PRIVATE/OPERATOR';
const product=Object.freeze({close(){assert.fail('HOST_SECOND_CAPTURE_OR_OPEN_FORBIDDEN');}}),connections={root:{pairingId:'HOST_ROOT'},phone:{pairingId:'HOST_PHONE'}};
const nativeDirectory=await mkdtemp(join(tmpdir(),'live-empty-renewal-host-'));await mkdir(join(nativeDirectory,'source-operations'));await mkdir(join(nativeDirectory,'dispatch-journal'));
let state,review,renewCalls=0,authorizeCalls=0,changeScope=false,changeSource=false;
mock.module('../src/public/public-operator-state-v4.mjs',{exports:{PUBLIC_OPERATOR_STATE_V4:stateDirectory,PUBLIC_NATIVE_DIRECTORY_V4:nativeDirectory,async readPrivateOperatorFileV4(directory,name){assert.equal(directory,stateDirectory);if(!files.has(name))throw Object.assign(Error('HOST_MISSING'),{code:'ENOENT'});return Buffer.from(JSON.stringify(files.get(name)));},async writePrivateOperatorFileV4(directory,name,bytes){assert.equal(directory,stateDirectory);assert.ok(!files.has(name));files.set(name,JSON.parse(bytes));}}});
mock.module('../src/public/financial-epoch-control-v5.mjs',{exports:{async publishPrivateFinancialStateDataV5(value){assert.deepEqual(value,state);}}});
mock.module('../../../packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs',{exports:{
 async readOriginalPagedPublicNativeFinancialStateV5(p){assert.strictEqual(p,product,'HOST_ORIGINAL_PRODUCT');return structuredClone(state);},
 readOriginalPagedPublicNativeConnectionV4(p){assert.strictEqual(p,product);return structuredClone(connections.root);},readOriginalPagedPublicNativePhoneConnectionV4(p){assert.strictEqual(p,product);return structuredClone(connections.phone);},
 readOriginalPagedPublicUniswapMixedConnectionV5(p){assert.strictEqual(p,product);return{descriptor:{deadlineMs:state.effectivePolicy.expiresAt-1800000}};},
 async readOriginalPagedPublicSepoliaDefiConnectionsV8(p){assert.strictEqual(p,product);return['AAVE_STATIC','MORPHO_V2'].map(protocol=>({protocol,paegSource:{descriptor:{deadlineMs:state.effectivePolicy.expiresAt-1800000}}}));},
 async authorizeOriginalPagedPublicNativeFinancialEpochV5(p,value){assert.strictEqual(p,product);assert.deepEqual(value,review);authorizeCalls++;return changeScope?{...structuredClone(state),reserved:{different:'1'}}:structuredClone(state);},
 async renewOriginalPagedPublicEmptyMixedSourcesV9(p){assert.strictEqual(p,product);renewCalls++;if(changeSource)await writeFile(join(nativeDirectory,'source-operations/native-wallet.json'),'{}');return{profile:'ORIGINAL_PAGED_PUBLIC_EMPTY_MIXED_RENEWAL_V9',financialTransactions:0,renewedSources:[{role:'UNISWAP_SOURCE4'},{role:'DEFI_SOURCE7'}]};},
}});
const {completeLivePublicEmptySourceRenewalV10:complete}=await import('../src/public/complete-live-empty-source-renewal-v10.mjs');
async function reset(){
 files.clear();renewCalls=0;authorizeCalls=0;changeScope=false;changeSource=false;
 const operations=Array.from({length:31},(_,index)=>({index,phase:'FINALIZED'})),oldPolicy={expiresAt:Date.now()-1000,maximumTotalFeeAtomic:'100'},oldLimits={maximumTotalSuccessorPools:'1',maximumSourcesPerWallet:'1'},policy={...oldPolicy,expiresAt:Date.now()+3600000},limits={...oldLimits,maximumSourcesPerWallet:'2'},checkpoint={identity:h(2),revision:210,dataSHA256:hash(operations),policySHA256:hash(oldPolicy)},epoch={epochId:h(5),nonce:h(1),predecessorEpochId:h(4),policy,limits,checkpoint};
 state={profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5',reviewEligible:true,basePolicy:oldPolicy,checkpoint,epoch,effectivePolicy:policy,limits,reserved:{fee:'10'},history:[{epoch:{epochId:h(4),policy:oldPolicy,limits:oldLimits}},{epoch}]};
 review={intentId:h(1),expectedCheckpoint:checkpoint,expectedEpochId:h(4),policy,limits};
 files.set('empty-source-renewal-intent-v9.json',{profile:'PUBLIC_EMPTY_SOURCE_RENEWAL_INTENT_V9',intentId:h(1),expiresAt:policy.expiresAt,previousEpochId:h(4),previousPolicySHA256:hash(oldPolicy),limitsSHA256:hash(oldLimits),sourceRowsSHA256:hash(operations),maximumSourcesPerWallet:'2'});files.set('empty-source-financial-review-'+h(1)+'.json',review);
 await writeFile(join(nativeDirectory,'source-operations/native-wallet.json'),JSON.stringify({revision:210,operations}));await writeFile(join(nativeDirectory,'dispatch-journal/native-wallet.json'),JSON.stringify({revision:1,operations:[]}));
}
test.after(async()=>{await rm(nativeDirectory,{recursive:true,force:true});});
test('same live product renews the existing epoch without a capture/reopen and retries only observe the same receipt',async()=>{
 await reset();const original=structuredClone(state),before=await readFile(join(nativeDirectory,'source-operations/native-wallet.json'));
 const first=await complete(root,product);assert.equal(first.profile,'ORIGINAL_PUBLIC_EMPTY_SOURCE_LIVE_RENEWAL_RECEIPT_V10');assert.equal(first.retainedInLiveProduct,true);assert.equal(first.financialTransactions,0);assert.equal(renewCalls,1);assert.equal(authorizeCalls,1);assert.deepEqual(state,original);assert.deepEqual(await readFile(join(nativeDirectory,'source-operations/native-wallet.json')),before);
 assert.equal(await complete(root,product),null);assert.equal(renewCalls,1);assert.equal(authorizeCalls,1);assert.equal(files.size,3,'one distinct live receipt; no captured receipt or fabricated capture');
});
test('completed renewal skips the original 31-row check after a legitimate pending deposit and dispatch',async()=>{
 await reset();await complete(root,product);
 const sourcePath=join(nativeDirectory,'source-operations/native-wallet.json'),dispatchPath=join(nativeDirectory,'dispatch-journal/native-wallet.json'),source=JSON.parse(await readFile(sourcePath));source.operations.push({phase:'UNKNOWN',jobId:'later-real-deposit'});source.revision++;
 await writeFile(sourcePath,JSON.stringify(source));await writeFile(dispatchPath,JSON.stringify({revision:2,operations:[{phase:'UNKNOWN',id:'later-native-operation'}]}));state.reviewEligible=false;
 const before=await Promise.all([sourcePath,dispatchPath].map(path=>readFile(path)));assert.equal(await complete(root,product),null);assert.equal(renewCalls,1);assert.equal(authorizeCalls,1);
 assert.deepEqual(await Promise.all([sourcePath,dispatchPath].map(path=>readFile(path))),before);
});
test('new epoch, changed financial scope and altered Source rows reject before a successful live receipt',async()=>{
 await reset();state.epoch.nonce=h(9);await assert.rejects(complete(root,product),/EXISTING_EPOCH_REQUIRED/);assert.equal(authorizeCalls,0);assert.equal(renewCalls,0);
 await reset();changeScope=true;await assert.rejects(complete(root,product),/FINANCIAL_SCOPE_CHANGED/);assert.equal(renewCalls,0);
 await reset();changeSource=true;await assert.rejects(complete(root,product),/SOURCE_CHANGED/);assert.equal(files.has('empty-source-live-renewal-ack-'+h(1)+'.json'),false);
});
