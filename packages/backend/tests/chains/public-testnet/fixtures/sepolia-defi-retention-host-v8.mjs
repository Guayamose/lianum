/** HOST issuer stand-ins only. Tests exercise real AEAD/process-fenced storage
 * across Node processes; compiled Original target rehydration is covered by the
 * Aave/Morpho target tests. No chain, signature, proof or spending acceptance. */
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const [mode,directory]=process.argv.slice(2),hex=n=>n.toString(16).padStart(2,'0').repeat(32);
const runtime=Object.freeze({metadata:{keysetId:hex(1)}}),uniswapTarget=Object.freeze({keysetId:hex(1),account:'0x'+'02'.repeat(20),planSHA256:hex(3)}),parent=Object.freeze({pool:'0x'+'04'.repeat(20)});
const plan=Object.freeze({profile:'HOST_TARGET_PLAN_NOT_A_CHAIN_ACCEPTANCE',planSHA256:hex(5),uniswapTargetPlanSHA256:hex(3),keysetId:hex(1),account:uniswapTarget.account,chainId:'11155111',startNonce:'70',constructors:[{creation:'0xdeadbeef',expectedAddress:'0x'+'06'.repeat(20)}]}),partial=Object.freeze({});
const receipts=Array.from({length:7},(_,index)=>({transactionHash:'0x'+hex(10+index)}));
const finalized=Object.freeze({profile:'HOST_TARGET_NOT_A_CHAIN_ACCEPTANCE',planSHA256:hex(5),receipts});
const descriptor=Object.freeze({profile:'HOST_DESCRIPTOR_ONLY',origin:'https://lianum.example',devicePublicKey:'04'+'11'.repeat(64),pairingId:hex(20),lifetime:hex(21)}),account=Object.freeze({});
const targetRetention=(system,observed)=>({profile:'ORIGINAL_AAVE_SEPOLIA_TARGET_RETENTION_V8',plan:structuredClone(plan),system:system?structuredClone(finalized):null,receipts:structuredClone(observed)});
const authorityRetention={profile:'ORIGINAL_SEPOLIA_DEFI_SHARES_AUTHORITY_RETENTION_V8',protocol:'AAVE_STATIC',descriptor,identity:hex(22),journalPath:join(directory,'authority','journal.vault'),journalRevision:3,journalDataSHA256:hex(23),targetPlanSHA256:hex(5),journalRecord:{revision:3,data:{profile:'HOST_AUTHORITY_RECORD_ONLY'}},adapterRecord:{revision:2,data:{profile:'HOST_ADAPTER_RECORD_ONLY'}},adapterCheckpoint:{profile:'ORIGINAL_SEPOLIA_DEFI_ACTIONS_CHECKPOINT_V8',path:join(directory,'authority','actions.aead'),revision:2,dataSHA256:hex(24)}};
const morphoPartial=Object.freeze({}),morphoPlan={...structuredClone(plan),planSHA256:hex(60),startNonce:'77'};
const url=file=>new URL('../../../../src/'+file,import.meta.url).href;
mock.module(url('operations/local/sepolia-uniswap-target-kernel-v4.mjs'),{exports:{readOriginalSepoliaUniswapTargetSourceBindingV4(r,t){assert.strictEqual(r,runtime,'HOST_ORIGINAL_RUNTIME');assert.strictEqual(t,uniswapTarget,'HOST_ORIGINAL_UNISWAP');return{parent};},async assertOriginalSepoliaUniswapTargetReadyV4(r,t){assert.strictEqual(r,runtime);assert.strictEqual(t,uniswapTarget);}}});
mock.module(url('operations/deployments/defi/aave-sepolia-target-v4.mjs'),{exports:{readOriginalAaveSepoliaTargetBindingV4(r,t){assert.strictEqual(r,runtime);assert.strictEqual(t,finalized,'HOST_ORIGINAL_AAVE_TARGET');return{uniswapTarget};},async retainOriginalAaveSepoliaTargetV8(r,t){assert.strictEqual(r,runtime);assert.strictEqual(t,finalized);return targetRetention(true,receipts);},readOriginalAaveSepoliaTargetPlanBindingV8(r,p){assert.strictEqual(r,runtime);assert.strictEqual(p,partial,'HOST_ORIGINAL_AAVE_PLAN');return{uniswapTarget};},async retainOriginalAaveSepoliaTargetPlanV8(r,p){assert.strictEqual(r,runtime);assert.strictEqual(p,partial);return targetRetention(false,[]);}}});
mock.module(url('operations/deployments/defi/morpho-v2-sepolia-target-v4.mjs'),{exports:{readOriginalMorphoV2SepoliaTargetPlanBindingV8(r,p){assert.strictEqual(r,runtime);assert.strictEqual(p,morphoPartial,'HOST_ORIGINAL_MORPHO_PLAN');return{uniswapTarget};},async retainOriginalMorphoV2SepoliaTargetPlanV8(r,p){assert.strictEqual(r,runtime);assert.strictEqual(p,morphoPartial);return{profile:'ORIGINAL_MORPHO_V2_SEPOLIA_TARGET_RETENTION_V8',plan:structuredClone(morphoPlan),system:null,receipts:[]};}}});
mock.module(url('accounts/authority/device-sepolia-defi-shares-authority-v4.mjs'),{exports:{readOriginalDeviceSepoliaDefiSharesBindingV8(r,a){assert.strictEqual(r,runtime);assert.strictEqual(a,account,'HOST_ORIGINAL_ACCOUNT');return{protocol:'AAVE_STATIC',target:finalized,uniswapTarget};},async retainOriginalDeviceSepoliaDefiSharesAuthorityV8(a){assert.strictEqual(a,account);return structuredClone(authorityRetention);}}});
const R=await import('../../../../src/operations/recovery/sepolia-defi-retention-v8.mjs'),input={directory,password:'public HOST fixture password '.repeat(3)};
let owner;
try{
 if(mode==='seed'){
  await assert.rejects(R.createOriginalSepoliaDefiRetentionV8(runtime,{...uniswapTarget},input),/HOST_ORIGINAL_UNISWAP/);
  owner=await R.createOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);
  await assert.rejects(R.createOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input),/FENCE_BUSY/);
  await assert.rejects(owner.publishInitialization('AAVE_STATIC',{...partial}),/HOST_ORIGINAL_AAVE_PLAN/);
  await owner.publishInitialization('AAVE_STATIC',partial);assert.equal(owner.checkpoint().phase,'ACTIVE');
  for(const name of await readdir(directory)){if(!name.endsWith('.vault'))continue;assert.ok(!(await readFile(join(directory,name),'utf8')).includes(plan.planSHA256),'HOST_CAPTURE_DATA_NOT_PLAINTEXT');}
 }else if(mode==='seed-multi'){
  owner=await R.createOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);await owner.publishInitialization('AAVE_STATIC',partial);await owner.publishInitialization('MORPHO_V2',morphoPartial);await owner.publishActivation({targets:{AAVE_STATIC:finalized},authorities:[]});await owner.capturePublishedInitialization();const selected=await R.readOriginalSepoliaDefiRetentionModeV8(input);assert.equal(selected.phase,'CAPTURED');assert.equal(selected.targets.AAVE_STATIC.ready,true);assert.equal(selected.targets.MORPHO_V2.ready,false);assert.equal(selected.targets.MORPHO_V2.planSHA256,morphoPlan.planSHA256);
 }else if(mode==='observe-multi'){
  owner=await R.openOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);assert.deepEqual(owner.bindings().protocols,['AAVE_STATIC','MORPHO_V2']);assert.deepEqual(owner.retainedTarget('MORPHO_V2').plan,morphoPlan);const aave=await owner.issueTarget('AAVE_STATIC'),morpho=await owner.issueInitialization('MORPHO_V2');await R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,aave,'target','AAVE_STATIC');await R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,morpho,'initialization','MORPHO_V2');await owner.complete();
 }else if(mode==='capture-empty'){
  owner=await R.createOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);await owner.capturePublishedInitialization();assert.deepEqual((await R.readOriginalSepoliaDefiRetentionModeV8(input)).targets,{});
 }else if(mode==='open-empty'){
  owner=await R.openOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);assert.deepEqual(owner.bindings(),{protocols:[],authorities:[]});await owner.complete();
 }else if(mode==='overflow-empty'){
  const {Vault}=await import('@lianum/engine/crypto/vault');owner=await R.openOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);const vault=new Vault(join(directory,'defi-supervisor.vault')),before=await vault.read(input.password),bytes=await readFile(join(directory,'defi-supervisor.vault'));await assert.rejects(owner.complete(),/GENERATION_OVERFLOW/);assert.deepEqual(await vault.read(input.password),before);assert.deepEqual(await readFile(join(directory,'defi-supervisor.vault')),bytes);
 }else if(mode==='root-read'){
  const {Vault}=await import('@lianum/engine/crypto/vault'),saved=await new Vault(join(directory,'defi-supervisor.vault')).read(input.password),expectedBinding=saved.data.binding,rootActor=saved.data.activationOwner;
  const selected=await R.readOriginalSepoliaDefiRetentionModeV8(input);assert.equal(selected.phase,'ACTIVE');assert.equal(selected.targets.AAVE_STATIC.ready,false);assert.equal(Object.hasOwn(selected.targets.AAVE_STATIC,'plan'),false);
  await assert.rejects(R.readOriginalSepoliaDefiPrivateCurrentV8({...input,expectedBinding:{...expectedBinding,keysetId:hex(99)},rootActor}),/ROOT_BINDING/);
  await assert.rejects(R.readOriginalSepoliaDefiPrivateCurrentV8({...input,expectedBinding,rootActor:{...rootActor,pid:rootActor.pid+1}}),/SAME_DEAD_ACTOR/);
  const data=await R.readOriginalSepoliaDefiPrivateCurrentV8({...input,expectedBinding,rootActor});assert.deepEqual(data.targets.AAVE_STATIC.plan,plan);assert.equal(data.checkpoint.phase,'ACTIVE');
  const checked=await R.validateOriginalSepoliaDefiPrivateCurrentSourceV8(data,{rpc:{block:async()=>({number:'0x1',hash:'0x'+hex(40)}),assertCanonical:async()=>{}},deployment:{},policy:{},sourceRows:[]});assert.equal(checked.validated,true);assert.equal(checked.financialPermissionIssued,false);assert.equal((await R.readOriginalSepoliaDefiRetentionModeV8(input)).phase,'ACTIVE');process.stdout.write(JSON.stringify({readOnly:true}));
 }else if(mode==='resume'){
  owner=await R.recoverOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);assert.equal(owner.checkpoint().phase,'OPENING');
  assert.deepEqual(owner.retainedTarget('AAVE_STATIC').plan,plan);assert.equal(owner.retainedTarget('AAVE_STATIC').system,null);assert.equal(owner.retainedTarget('AAVE_STATIC').receipts.length,0);
  await assert.rejects(owner.issueTarget('AAVE_STATIC'),/NOT_READY/);const token=await owner.issueInitialization('AAVE_STATIC');
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,{...token},'initialization','AAVE_STATIC'),/ORIGINAL_RETENTION_TOKEN/);
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,token,'target','AAVE_STATIC'),/ORIGINAL_RETENTION_TOKEN/);
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8({...runtime},uniswapTarget,token,'initialization','AAVE_STATIC'),/ORIGINAL_RETENTION_TOKEN/);
  const retained=await R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,token,'initialization','AAVE_STATIC');assert.deepEqual(retained.plan,plan);
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,token,'initialization','AAVE_STATIC'),/ORIGINAL_RETENTION_TOKEN/);
  await owner.complete();await assert.rejects(owner.capture({targets:{AAVE_STATIC:{...finalized}},authorities:[]}),/HOST_ORIGINAL_AAVE_TARGET/);
  await owner.capture({targets:{AAVE_STATIC:finalized},authorities:[account]});assert.equal(owner.checkpoint().phase,'CAPTURED');
 }else if(mode==='observe'){
  owner=await R.openOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,input);assert.deepEqual(owner.bindings().protocols,['AAVE_STATIC']);assert.equal(owner.bindings().authorities[0].descriptor.pairingId,descriptor.pairingId);
  await assert.rejects(owner.issueInitialization('AAVE_STATIC'),/ALREADY_READY/);
  const target=await owner.issueTarget('AAVE_STATIC');await assert.rejects(owner.issueTarget('AAVE_STATIC'),/ALREADY_ISSUED/);
  await assert.rejects(owner.complete(),/COMPONENTS_REQUIRED/);
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8(runtime,{...uniswapTarget},target,'target','AAVE_STATIC'),/ORIGINAL_RETENTION_TOKEN/);
  assert.deepEqual((await R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,target,'target','AAVE_STATIC')).receipts,receipts);
  await assert.rejects(owner.issueAuthority('AAVE_STATIC','04'+'99'.repeat(64)),/COMPONENT_MISSING/);
  const authority=await owner.issueAuthority('AAVE_STATIC',descriptor.devicePublicKey);
  await assert.rejects(R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,authority,'authority','MORPHO_V2'),/ORIGINAL_RETENTION_TOKEN/);
  assert.equal((await R.consumeOriginalSepoliaDefiComponentV8(runtime,uniswapTarget,authority,'authority','AAVE_STATIC')).journalRevision,3);
  await owner.complete();assert.equal(owner.checkpoint().phase,'ACTIVE');
 }else if(mode==='wrong-password'){
  await assert.rejects(R.openOriginalSepoliaDefiRetentionV8(runtime,uniswapTarget,{...input,password:'wrong '.repeat(16)}));process.stdout.write(JSON.stringify({rejected:true}));
 }else throw Error('HOST_UNKNOWN_MODE');
 if(owner)process.stdout.write(JSON.stringify({checkpoint:owner.checkpoint(),hostOnly:true,financialAcceptance:false}));
}finally{await owner?.close();}
