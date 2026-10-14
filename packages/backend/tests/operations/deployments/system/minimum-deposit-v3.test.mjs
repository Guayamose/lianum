/** Genuine reviewed compiler artifacts and data-only proposals. Trace hashing
 * is explicitly synthetic; these tests make no claim of proof acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadMinimumDepositLedgerArtifacts} from '../../../../src/operations/deployments/system/append-only-deployment-artifacts-v3.mjs';
import {deriveMinimumDepositLibraryPlans,buildMinimumDepositDeploymentPlan,buildMinimumDepositSuccessorPlan,FLAT_MINIMUM_PROFILE} from '../../../../src/operations/deployments/system/append-only-deployment-plan-v3.mjs';
import {normalizeMinimumDepositAtomic,assertFlatMinimumDepositAmount} from '../../../../src/chains/shared/contracts/minimum-deposit-v3.mjs';
import {FLAT_VERIFIER_ORDER} from '../../../../src/operations/deployments/system/deployment-plan.mjs';
import {FIELD_MODULUS} from '@lianum/components/encoding/commitments';
import {validateFlatOwnerReadPayload} from '@lianum/mobile-protocol/wallet/owner-portfolio-contract';
const {compilation,sourceMap,artifacts,immutableNames}=loadMinimumDepositLedgerArtifacts();
const digest=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const traceHash=fields=>(1n+fields.reduce((n,x,i)=>n+x*BigInt(i+1),0n)%(FIELD_MODULUS-1n)).toString(16).padStart(64,'0');
function fixture(){
 const addresses={poseidon2Domains:address(201),hubCodec:address(202),poolRegistryCodec:address(203)};
 const libraries=deriveMinimumDepositLibraryPlans({compilation,sourceMap,addresses});
 const attesterKeys=[1,2,3,4].map(n=>{const key=createECDH('secp256k1');key.setPrivateKey(Buffer.from(digest(n).slice(2),'hex'));const publicKey=key.getPublicKey('hex');return{x:publicKey.slice(2,66),y:publicKey.slice(66)};});
 return{compilation,sourceMap,chainId:'31337',sender:address(50),nextNonce:'20',deploymentDomain:digest(7),registryEpoch:'8',rulesRoot:digest(9),attesterKeys,libraries:Object.fromEntries(Object.entries(libraries).map(([role,x])=>[role,{address:x.address,codeHash:x.codeHash}])),verifiers:Object.fromEntries(FLAT_VERIFIER_ORDER.map(([role],i)=>[role,{address:address(100+i),codeHash:digest(1000+i)}])),pools:[{asset:address(0),assetCodeHash:digest(0),deploymentDomain:digest(11),policy:digest(12),minimumDepositAtomic:'100'},{asset:address(300),assetCodeHash:digest(301),deploymentDomain:digest(13),policy:digest(14),minimumDepositAtomic:'250'}]};
}
test('genuine new V3 build contains uint64 minimum before original constructor and immutable runtime slots',()=>{
 const constructor=artifacts.pool.abi.find(x=>x.type==='constructor');assert.deepEqual(constructor.inputs[0].components[0],{internalType:'uint64',name:'minimumDepositAmount',type:'uint64'});
 assert.ok(Object.values(immutableNames.pool).includes('minimumDepositAmount'));assert.equal(artifacts.pool.evm.deployedBytecode.object.length/2,22838);assert.equal(artifacts.hub.evm.deployedBytecode.object.length/2,24415);
});
test('minimum rejects absence, zero, noncanonical values and uint64 overflow without a fallback',()=>{
 for(const amount of [undefined,null,0,'0','00','01','-1','1.0','1\n',String(1n<<64n)])assert.throws(()=>normalizeMinimumDepositAtomic(amount));
 assert.equal(normalizeMinimumDepositAtomic(String((1n<<64n)-1n)),String((1n<<64n)-1n));assert.throws(()=>assertFlatMinimumDepositAmount('100','99'),/BELOW_MINIMUM/);assert.equal(assertFlatMinimumDepositAmount('100','100'),'100');
});
test('per-asset minimum binds real constructor words, expected bytecode and successor proposal',async()=>{
 const input=fixture(),plan=await buildMinimumDepositDeploymentPlan(input,{hashFields:traceHash});
 for(const [index,pool]of plan.pools.entries()){assert.equal(pool.minimumDepositAtomic,input.pools[index].minimumDepositAtomic);assert.equal(pool.immutableValues.minimumDepositAmount,pool.minimumDepositAtomic);assert.equal(pool.constructorData.slice(2,66),BigInt(pool.minimumDepositAtomic).toString(16).padStart(64,'0'));assert.equal((pool.constructorData.length-2)/2,1152);}
 const changed=fixture();changed.pools[0].minimumDepositAtomic='101';const other=await buildMinimumDepositDeploymentPlan(changed,{hashFields:traceHash});assert.notEqual(other.pools[0].codeHash,plan.pools[0].codeHash);assert.equal(other.pools[1].codeHash,plan.pools[1].codeHash);
 const successor=await buildMinimumDepositSuccessorPlan({compilation,sourceMap,chainId:'31337',sender:input.sender,nextNonce:'24',hub:{address:plan.hub.address,codeHash:plan.hub.codeHash,hubDomain:plan.hubDomain,registryCommitment:plan.registryCommitment,ledgerNamespace:plan.ledgerNamespace},verifierSet:plan.verifierSet,verifierSetCommitment:plan.verifierSetCommitment,libraries:input.libraries,pool:{...input.pools[0],deploymentDomain:digest(900),policy:digest(901)}},{hashFields:traceHash});assert.equal(successor.minimumDepositAtomic,'100');assert.equal(successor.immutableValues.minimumDepositAmount,'100');assert.equal((successor.constructorData.length-2)/2,1152);
});
test('planners reject missing, zero and overflow minimum and altered compilation pins',async()=>{
 for(const value of [undefined,'0',String(1n<<64n)]){const input=fixture();if(value===undefined)delete input.pools[0].minimumDepositAtomic;else input.pools[0].minimumDepositAtomic=value;await assert.rejects(buildMinimumDepositDeploymentPlan(input,{hashFields:traceHash}));}
 const input=fixture();input.compilation=structuredClone(compilation);input.compilation.sourceASTs['v2/PrivateFlatAssetNotePoolV3.sol'].id++;await assert.rejects(buildMinimumDepositDeploymentPlan(input,{hashFields:traceHash}),/AST_PIN/);
});
test('original TOP_UP rejects below immutable minimum before constructing D26 worker',async()=>{
 const source=await readFile(new URL('../../../../src/accounts/authority/flat-account-authority.mjs',import.meta.url),'utf8');const a=source.indexOf('  async function tokenFundingReady(amount)'),b=source.indexOf('  async function manualGraphTime(ref)',a);assert.ok(a>=0&&b>a);
 const body=source.slice(a,b);let workers=0,proofs=0,sends=0,ownerReads=0;
 const environment={assert,normalizeMinimumDepositAtomic,assertFlatMinimumDepositAmount,FLAT_MINIMUM_PROFILE,system:{deploymentProfile:FLAT_MINIMUM_PROFILE},pool:{minimumDepositAtomic:'100',runtimeCode:'0x1234'},nativeAsset:true,runtime:{block:async()=>({number:'0x1'}),code:async()=>{throw Error('MUST_REJECT_BEFORE_RPC');}},owner:{ownerProof:{deposit:async()=>{ownerReads++;return{statement:{amount:'99'}};}}},operation:()=>({kind:'TOP_UP'}),createProofProcess:()=>{workers++;return{prove:()=>proofs++};},submitOwner:()=>sends++};
 const execute=new Function(...Object.keys(environment),body+'\nreturn executeNote;')(...Object.values(environment));await assert.rejects(execute('test-original'),/BELOW_MINIMUM/);assert.deepEqual({workers,proofs,sends,ownerReads},{workers:0,proofs:0,sends:0,ownerReads:1});
});
test('owner transport preserves declared minimum and rejects malformed thresholds',()=>{
 const row={version:1,status:'UNAVAILABLE',asset:{assetId:'1'.repeat(64),symbol:'ETH',decimals:18,minimumDepositAtomic:'100'},observed:null,balances:null,backing:null,requests:[]};assert.equal(validateFlatOwnerReadPayload(row).data.asset.minimumDepositAtomic,'100');for(const amount of ['0','01',String(1n<<64n)]){const changed=structuredClone(row);changed.asset.minimumDepositAtomic=amount;assert.throws(()=>validateFlatOwnerReadPayload(changed));}
});
