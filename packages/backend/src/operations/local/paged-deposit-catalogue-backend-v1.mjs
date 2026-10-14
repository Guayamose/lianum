/** Mechanical catalogue instance; only the closed deployment composition
 * exposes original catalogue ownership. No runtime/authority imports. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
export function buildPagedDepositCatalogueBackendV1(contracts){
 assert.equal(arguments.length,1);assert.ok(contracts&&!types.isProxy(contracts)&&Object.getPrototypeOf(contracts)===Object.prototype);assert.deepEqual(Reflect.ownKeys(contracts).sort(),['appendOriginalFundedPagedGraphWalletV3', 'assertLocalEvm', 'assertOriginalFundedPagedGraphWalletV3', 'assertOriginalPoolCreationQuotaV1', 'readOriginalFundedPagedGraphDeploymentV3', 'reopenOriginalFundedPagedGraphWalletCollectionV1', 'retainOriginalFundedPagedGraphDeploymentV3'].sort());for(const key of Reflect.ownKeys(contracts)){assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(contracts,key),'value'));assert.equal(typeof contracts[key],'function');}
 const {assertLocalEvm,assertOriginalPoolCreationQuotaV1,assertOriginalFundedPagedGraphWalletV3,readOriginalFundedPagedGraphDeploymentV3,appendOriginalFundedPagedGraphWalletV3,retainOriginalFundedPagedGraphDeploymentV3,reopenOriginalFundedPagedGraphWalletCollectionV1}=contracts;
const owned=new WeakMap();
function exact(v,keys){assert.ok(v&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype,'PAGED_CATALOGUE_DATA');assert.deepEqual(Reflect.ownKeys(v).sort(),[...keys].sort(),'PAGED_CATALOGUE_FIELDS');for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,key),'value'));}
function amount(v){assert.equal(typeof v,'string');assert.match(v,/^[1-9][0-9]*$/,'PAGED_CATALOGUE_AMOUNT');assert.ok(BigInt(v)<(1n<<64n));return BigInt(v);}
function request(raw){exact(raw,['amountAtomic','purpose']);amount(raw.amountAtomic);assert.ok(['DEPOSIT','GRAPH_SOURCE'].includes(raw.purpose),'PAGED_CATALOGUE_PURPOSE');return {amountAtomic:raw.amountAtomic,purpose:raw.purpose,slots:raw.purpose==='GRAPH_SOURCE'?3n:1n};}
/** Capacity is derived from original immutable code and a canonical same-head
 * read. Paged256 note slots are distinct from per-page64 graph entries. */
async function readOriginalPagedDepositCapacityV1(runtime,system){
 assert.equal(arguments.length,2);await assertLocalEvm(runtime);assertOriginalFundedPagedGraphWalletV3(runtime,system);const d=readOriginalFundedPagedGraphDeploymentV3(runtime,system),head=await runtime.block();await runtime.assertCanonical(head);
 for(const kind of ['pool','state','native'])assert.equal(await runtime.code(d[kind].address,head.number),d[kind].expectedCode,'PAGED_CATALOGUE_ORIGINAL_CODE');
 const values={};for(const method of ['CAPACITY','leafCount','liveReservations','minimumDepositAmount']){const raw=await d.call('pool',method+'()',[],head.number);assert.match(raw,/^0x[0-9a-f]{64}$/,'PAGED_CATALOGUE_WORD');values[method]=BigInt(raw);}
 assert.equal(values.CAPACITY,256n,'PAGED_CATALOGUE_FIXED_CAPACITY');assert.ok(values.leafCount>=0n&&values.liveReservations>=0n&&values.leafCount+values.liveReservations<=values.CAPACITY,'PAGED_CATALOGUE_CAPACITY_CORRUPT');assert.equal(values.minimumDepositAmount,BigInt(system.minimumDepositAtomic),'PAGED_CATALOGUE_MINIMUM_CHANGED');await runtime.assertCanonical(head);assert.equal((await runtime.block()).hash,head.hash,'PAGED_CATALOGUE_HEAD_CHANGED');
 return Object.freeze({pool:system.pool,head:Object.freeze({...head}),capacity:'256',leafCount:values.leafCount.toString(),liveReservations:values.liveReservations.toString(),freeNoteSlots:(values.CAPACITY-values.leafCount-values.liveReservations).toString(),minimumDepositAtomic:system.minimumDepositAtomic});
}
function build(runtime,systems,quota,principal){
 assertOriginalPoolCreationQuotaV1(runtime,quota);assert.match(principal,/^[0-9a-f]{64}$/);for(const s of systems)assertOriginalFundedPagedGraphWalletV3(runtime,s);let busy=false,closed=false,rotationFault=false;
 async function exclusive(work){assert.ok(!busy&&!closed,'PAGED_CATALOGUE_UNAVAILABLE');busy=true;try{return await work();}finally{busy=false;}}
 async function select(r){for(const system of [...systems].reverse()){const capacity=await readOriginalPagedDepositCapacityV1(runtime,system);if(BigInt(r.amountAtomic)>=BigInt(capacity.minimumDepositAtomic)&&BigInt(capacity.freeNoteSlots)>=r.slots)return Object.freeze({system,capacity,purpose:r.purpose});}return null;}
 const catalogue=Object.freeze({
  systems(){assert.ok(!closed);return Object.freeze([...systems]);},
  async select(raw){const r=request(raw);return exclusive(()=>select(r));},
  /** Rotation is explicit and only possible when no existing original pool has
   * the required room. UNKNOWN creation never triggers an automatic retry. */
  async rotate(raw,input){assert.equal(arguments.length,2);exact(input,['manifestSHA256','consumerSHA256','deploymentDomain','policy','registryEpoch','rulesRoot','attesterKeys','minimumDepositAtomic']);const r=request(raw);return exclusive(async()=>{assert.ok(!rotationFault,'PAGED_CATALOGUE_ROTATION_FENCED');assert.equal(await select(r),null,'PAGED_CATALOGUE_SPACE_ALREADY_AVAILABLE');assert.ok(systems.length<257,'PAGED_CATALOGUE_GENERATION_BOUND');assert.ok(BigInt(r.amountAtomic)>=amount(input.minimumDepositAtomic),'PAGED_CATALOGUE_DEPOSIT_BELOW_MINIMUM');const prior=systems.at(-1);rotationFault=true;const next=await appendOriginalFundedPagedGraphWalletV3(runtime,prior,input,quota,principal);systems.push(next);rotationFault=false;return Object.freeze({system:next,capacity:await readOriginalPagedDepositCapacityV1(runtime,next),purpose:r.purpose});});},
  retain(){assert.ok(!closed&&!busy,'PAGED_CATALOGUE_UNAVAILABLE');return {profile:'ORIGINAL_PAGED_DEPOSIT_CATALOGUE_RETENTION_V1',principal,systems:systems.map(system=>retainOriginalFundedPagedGraphDeploymentV3(runtime,system))};},
  close(){assert.ok(!busy);closed=true;}
 });owned.set(catalogue,{runtime,systems,quota,principal,live:()=>!closed});return catalogue;
}
function createOriginalPagedDepositCatalogueV1(runtime,initialSystem,quota,principal){assert.equal(arguments.length,4);return build(runtime,[initialSystem],quota,principal);}
async function reopenOriginalPagedDepositCatalogueV1(runtime,token,quota){assert.equal(arguments.length,3);assertOriginalPoolCreationQuotaV1(runtime,quota);const restored=await reopenOriginalFundedPagedGraphWalletCollectionV1(runtime,token);return build(runtime,[...restored.systems],quota,restored.principal);}
function assertOriginalPagedDepositCatalogueV1(runtime,catalogue){assert.equal(arguments.length,2);const c=owned.get(catalogue);assert.ok(c?.runtime===runtime&&c.live(),'PAGED_CATALOGUE_ORIGINAL');return catalogue;}

 return Object.freeze({readOriginalPagedDepositCapacityV1,createOriginalPagedDepositCatalogueV1,reopenOriginalPagedDepositCatalogueV1,assertOriginalPagedDepositCatalogueV1});
}
