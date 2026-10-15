/** ORIGINAL PUBLIC minimum-ledger target producer. Fixed compiler/contracts,
 * parent verifier lineage and original venue only; no caller artifact, address,
 * key, hash callback, LOCAL adoption or financial proof acceptance. */
import assert from 'node:assert/strict';
import {consumeOriginalPagedPublicUniswapMixedComponentV4} from '../recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {compileFixedSepoliaFlatMinimumLedgerV4} from '../deployments/defi/sepolia-flat-minimum-compilation-v4.mjs';
import {compileFixedSepoliaUniswapDeliveryV4} from '../deployments/defi/sepolia-uniswap-compilation-v4.mjs';
import {loadFlatVerifierArtifacts} from '../deployments/system/deployment-artifacts.mjs';
import {buildFixedSepoliaFlatMinimumPlannerDataV4} from '../deployments/system/sepolia-flat-minimum-plan-data-v4.mjs';
import {assertOriginalFundedPagedGraphSepoliaWalletV4,assertOriginalPagedSepoliaReceiverReadyV4} from './funded-graph-paged-public-kernel-v4.mjs';
import {assertOriginalPagedSepoliaUniswapVenueV4,readOriginalPagedSepoliaUniswapVenueV4} from '../../chains/public-testnet/sepolia-uniswap-venue-v4.mjs';
import {readOriginalPagedSepoliaSourceLaneV4,assertOriginalPagedSepoliaSourcePolicyBirthV5} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {assertOriginalPagedSepoliaCodeSetV6} from '../../chains/public-testnet/sepolia-code-read-v6.mjs';
import {publicPagedTestnetNetworksV1} from '../../chains/public-testnet/profile-v1.mjs';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {nativeAdmissionRulesTree} from '@lianum/engine/execution/native/dispatch/native-admission';
import {deriveNativeRuntimeCode,predictNativeCreateAddress,nativeStaticArguments,nativeProofCalldata} from '../../execution/native/dispatch/native-deployment.mjs';
import {canonicalField,fixedArray,PROFILE_FIELD} from '@lianum/components/encoding/commitments';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {buildSepoliaUniswapFlatJournalDataV4} from './sepolia-uniswap-flat-journal-data-v4.mjs';
import {readSepoliaUniswapFlatLedgerDataV4} from '../../chains/public-testnet/sepolia-uniswap-flat-ledger-data-v4.mjs';
const plans=new WeakMap(),constructors=new WeakMap(),systems=new WeakMap(),domainReaders=new WeakMap(),parentAttempts=new WeakMap(),targetBirths=new WeakMap(),registrationGrants=new WeakMap();
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;},sha=v=>createHash('sha256').update(v).digest('hex'),canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}',keccak=(r,v)=>r.keccak(v),fresh=()=> '0x'+randomBytes(32).toString('hex');
const LIBRARIES={poseidon2Domains:['contracts/wallet/crypto/Poseidon2Domains.sol','Poseidon2Domains'],hubCodec:['contracts/wallet/FlatHubCodec.sol','FlatHubCodec'],poolRegistryCodec:['contracts/wallet/v2/FlatPoolRegistryCodecV2.sol','FlatPoolRegistryCodecV2']};
const domainSignature='domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)',selector=async(r,s)=>(await r.keccak('0x'+Buffer.from(s).toString('hex'))).slice(2,10),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0');
function originalPlan(runtime,plan){const p=plans.get(plan);assert.ok(p?.runtime===runtime&&!p.closed,'PUBLIC_UNISWAP_ORIGINAL_TARGET_PLAN');assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,p.parent);return p;}
function immutableNames(ast,name){const contract=ast.nodes.find(n=>n.nodeType==='ContractDefinition'&&n.name===name);assert.ok(contract);return Object.fromEntries(contract.nodes.filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable').map(n=>[n.id,n.name]));}
function compilationPin(build){const sources=Object.fromEntries(build.sources.map(row=>[row.name,[row.sha256,sha(canonical(build.sourceASTs[row.name]))]])),names={hub:['contracts/wallet/v2/PrivateFlatReceiptHubV2.sol','PrivateFlatReceiptHubV2'],pool:['contracts/wallet/v2/PrivateFlatAssetNotePoolV3.sol','PrivateFlatAssetNotePoolV3'],...LIBRARIES};return freeze({attempt:'NEW_PUBLIC_SEPOLIA_FLAT_MINIMUM_V4',settingsSHA256:sha(canonical(build.settings)),sources,artifacts:Object.fromEntries(Object.entries(names).map(([role,[file,name]])=>[role,[file,name,sha(canonical(build.contracts[file][name]))]]))});}
async function checkParent(runtime,parent,head){assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,parent);await assertOriginalPagedSepoliaCodeSetV6(runtime,parent.deployments,head);assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,parent);}
const hashPorts=Object.freeze({async hashOriginalDomain(token,fields){const d=domainReaders.get(token);assert.ok(d&&!d.closed,'PUBLIC_UNISWAP_ORIGINAL_DOMAIN_READER');fixedArray(fields,18);assert.deepEqual(fields.slice(0,4),[PROFILE_FIELD,1n,1n,14n]);const words=[];for(let i=4;i<fields.length;i+=2){assert.ok(typeof fields[i]==='bigint'&&fields[i]>=0n&&fields[i]<1n<<128n&&typeof fields[i+1]==='bigint'&&fields[i+1]>=0n&&fields[i+1]<1n<<128n);words.push(fields[i].toString(16).padStart(32,'0')+fields[i+1].toString(16).padStart(32,'0'));}assert.equal(await d.runtime.code(d.library.address,d.head.number),d.library.expectedCode);const result=await d.runtime.call({to:d.library.address,data:'0x'+await selector(d.runtime,domainSignature)+words.join('')},d.head.number);assert.match(result,/^0x[0-9a-f]{64}$/);canonicalField(result.slice(2),true);await d.runtime.assertCanonical(d.head);return result.slice(2);}});
/** One fixed target attempt per original parent. Its fresh scope/policy and
 * expected constructors stay immutable across retries; no budget reset. */
export async function prepareOriginalSepoliaUniswapTargetV4(runtime,parent,venue,startNonce){
 assert.equal(arguments.length,4);assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,parent);assertOriginalPagedSepoliaUniswapVenueV4(runtime,venue);assert.ok(typeof startNonce==='bigint'&&startNonce>=0n&&startNonce+7n<1n<<64n);
 const pending=targetBirths.get(parent);if(pending){assert.equal(pending.runtime,runtime);assert.equal(pending.venue,venue);assert.equal(pending.startNonce,startNonce);return pending.work;}
 const previous=parentAttempts.get(parent);if(previous){assert.equal(previous.runtime,runtime);assert.equal(previous.venue,venue);assert.equal(previous.startNonce,startNonce);await assertOriginalPagedSepoliaReceiverReadyV4(runtime,parent);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,previous.data.policySHA256);const head=await runtime.block();await checkParent(runtime,parent,head);return previous.plan;}
 const birth={runtime,venue,startNonce,work:null};targetBirths.set(parent,birth);
 birth.work=prepareTarget(runtime,parent,venue,startNonce).finally(()=>{if(targetBirths.get(parent)===birth)targetBirths.delete(parent);});return birth.work;
}
async function prepareTarget(runtime,parent,venue,startNonce,reopening=null){
 await assertOriginalPagedSepoliaReceiverReadyV4(runtime,parent);const pending=await runtime.nonce(runtime.accounts[0],'pending');if(reopening===null)assert.equal(pending,startNonce,'PUBLIC_UNISWAP_TARGET_CURRENT_NONCE');else assert.ok(pending>=startNonce+7n,'PUBLIC_UNISWAP_TARGET_REOPEN_NONCE');
 const build=compileFixedSepoliaFlatMinimumLedgerV4(),retained=await loadFlatVerifierArtifacts(),pins=compilationPin(build),flat={...build,profile:'standard'},nativeRules=publicPagedTestnetNetworksV1().map(n=>n.rule),before=nativeAdmissionRulesTree(nativeRules);assert.equal(before.root,parent.registry.rulesRoot,'PUBLIC_UNISWAP_ORIGINAL_NATIVE_RULES');
 const view=await readOriginalPagedSepoliaUniswapVenueV4(venue);assert.equal(view.selection,'AAVE_USDC');const outputCode=await runtime.code(view.output.address,view.head.number),outputHash=await keccak(runtime,outputCode),outputIdentity=derivePrivateAssetIdentity('11155111',view.output.address,outputHash),rule={...nativeRules[0],asset:outputIdentity.slice(2)},rules=[...nativeRules,rule],tree=nativeAdmissionRulesTree(rules),head=await runtime.block();await checkParent(runtime,parent,head);
 const currentPolicy=readOriginalPagedSepoliaSourceLaneV4(runtime).policy,shared={};
 for(const role of ['poseidon2Domains','hubCodec']){const [file,name]=LIBRARIES[role],row=parent.deployments.find(d=>d.source===file&&d.name===name);assert.ok(row,'PUBLIC_UNISWAP_ORIGINAL_SHARED_LIBRARY');assert.equal(row.expectedCode,'0x'+build.artifacts[role].evm.deployedBytecode.object,'PUBLIC_UNISWAP_BYTEEXACT_SHARED_LIBRARY');assert.equal(await runtime.code(row.address,head.number),row.expectedCode);shared[role]=row;}
 const registryAddress=predictNativeCreateAddress(runtime.accounts[0],startNonce),planner=buildFixedSepoliaFlatMinimumPlannerDataV4(pins,hashPorts),libraryPlans=planner.deriveLibraryPlans({compilation:flat,sourceMap:build.sourceMap,addresses:{poseidon2Domains:shared.poseidon2Domains.address,hubCodec:shared.hubCodec.address,poolRegistryCodec:registryAddress}});
 const reader=Object.freeze(Object.create(null));domainReaders.set(reader,{runtime,parent,head,library:shared.poseidon2Domains,closed:false});let target;
 try{target=await planner.plan({compilation:flat,sourceMap:build.sourceMap,chainId:'11155111',sender:runtime.accounts[0],nextNonce:(startNonce+1n).toString(),deploymentDomain:reopening?.plan.target.hub.configuration.deploymentDomain??fresh(),registryEpoch:(BigInt(parent.registry.registryEpoch)+1n).toString(),rulesRoot:'0x'+tree.root,attesterKeys:parent.registry.keys,pools:[{asset:view.input.address,assetCodeHash:await keccak(runtime,await runtime.code(view.input.address,view.head.number)),deploymentDomain:reopening?.plan.target.pools[0].configuration.deploymentDomain??fresh(),policy:reopening?.plan.target.pools[0].configuration.policy??fresh(),minimumDepositAtomic:parent.minimumDepositAtomic},{asset:view.output.address,assetCodeHash:outputHash,deploymentDomain:reopening?.plan.target.pools[1].configuration.deploymentDomain??fresh(),policy:reopening?.plan.target.pools[1].configuration.policy??fresh(),minimumDepositAtomic:'1000000'}],libraries:Object.fromEntries(Object.entries(libraryPlans).map(([role,d])=>[role,{address:d.address,codeHash:d.codeHash}])),verifiers:Object.fromEntries(Object.entries(retained.verifiers).map(([role,entry])=>{const rows=parent.deployments.filter(d=>d.name==='HonkVerifier'&&d.source===entry.source);assert.equal(rows.length,1,'PUBLIC_UNISWAP_SHARED_VERIFIER_'+role);return[role,{address:rows[0].address,codeHash:rows[0].codeHash}];}))},reader);}finally{domainReaders.get(reader).closed=true;}
 const routerBuild=compileFixedSepoliaUniswapDeliveryV4(),router=routerBuild.artifact,routerAddress=predictNativeCreateAddress(runtime.accounts[0],startNonce+4n),pool=target.pools[1],im={solver:runtime.accounts[0],targetPool:pool.address,poolCode:'0x'+sha(Buffer.from(pool.runtimeCode.slice(2),'hex')),scope:pool.scope,policy:pool.configuration.policy},routerRuntime=deriveNativeRuntimeCode({artifact:router,deployedAddress:routerAddress,libraries:{},immutableNames:immutableNames(routerBuild.ast,'PrivateSepoliaUniswapDeliveryV4'),immutableValues:im}),routerArgs=nativeStaticArguments([{type:'address'},{type:'address'}],[runtime.accounts[0],pool.address]);
 const data=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_PLAN_V4',chainId:'11155111',keysetId:runtime.metadata.keysetId,account:runtime.accounts[0],predecessor:parent.pool,startNonce:startNonce.toString(),inputCompilationSHA256:build.inputSHA256,outputCompilationSHA256:build.outputSHA256,routerCompilationSHA256:routerBuild.outputSHA256,policySHA256:reopening?.plan.policySHA256??sha(JSON.stringify(currentPolicy)),rules, rulesRoot:tree.root,target,
  constructors:[{source:LIBRARIES.poolRegistryCodec[0],name:LIBRARIES.poolRegistryCodec[1],nonce:startNonce.toString(),expectedAddress:registryAddress,creation:libraryPlans.poolRegistryCodec.creationData,expectedCode:libraryPlans.poolRegistryCodec.runtimeCode},...[target.hub,...target.pools].map((d,i)=>({source:i===0?'contracts/wallet/v2/PrivateFlatReceiptHubV2.sol':'contracts/wallet/v2/PrivateFlatAssetNotePoolV3.sol',name:i===0?'PrivateFlatReceiptHubV2':'PrivateFlatAssetNotePoolV3',nonce:d.nonce,expectedAddress:d.address,creation:d.creationData,expectedCode:d.runtimeCode})),{source:'contracts/wallet/defi/PrivateSepoliaUniswapDeliveryV4.sol',name:'PrivateSepoliaUniswapDeliveryV4',nonce:(startNonce+4n).toString(),expectedAddress:routerAddress,creation:'0x'+router.evm.bytecode.object+routerArgs.slice(2),expectedCode:routerRuntime}],router:{address:routerAddress,expectedCode:routerRuntime,immutable:im},minimum:{inputAtomic:parent.minimumDepositAtomic,outputAtomic:'1000000'},constructorCount:5,applicationContracts:4,additionalLibraryContracts:1,postDeploymentCalls:target.postDeployment.map((call,index)=>({label:'register original Uniswap target pool '+index,from:runtime.accounts[0],to:call.target,nonce:(startNonce+5n+BigInt(index)).toString(),value:'0',data:'0x'+build.artifacts.hub.evm.methodIdentifiers['registerPoolDomain(address)']+call.pool.slice(2).padStart(64,'0'),pool:call.pool,method:'registerPoolDomain(address)'})),requiresTwoDomainRegistrationCalls:true,financialAcceptance:false});
 const plan=Object.freeze(Object.create(null)),p={plan,runtime,parent,venue,startNonce,data:freeze({...data,planSHA256:sha(JSON.stringify(data))}),build,routerBuild,closed:false,issued:new Map(),receipts:new Map(),registrationTokens:new Map(),registrationReceipts:new Map(),system:null,reopening};plans.set(plan,p);await checkParent(runtime,parent,head);const afterNonce=await runtime.nonce(runtime.accounts[0],'pending');if(reopening===null)assert.equal(afterNonce,startNonce,'PUBLIC_UNISWAP_TARGET_CURRENT_NONCE');else{assert.ok(afterNonce>=startNonce+7n,'PUBLIC_UNISWAP_TARGET_REOPEN_NONCE');assert.deepEqual(p.data,reopening.plan,'PUBLIC_UNISWAP_TARGET_RECOMPILED_PLAN');assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);}parentAttempts.set(parent,p);return plan;
}
export function readOriginalSepoliaUniswapTargetPlanV4(runtime,plan){assert.equal(arguments.length,2);return originalPlan(runtime,plan).data;}
export function readOriginalSepoliaUniswapTargetProgressV4(runtime,plan){assert.equal(arguments.length,2);const p=originalPlan(runtime,plan);return freeze({constructorsObserved:p.receipts.size,registrationsObserved:p.registrationReceipts.size,nextIndex:p.receipts.size+p.registrationReceipts.size,finalized:p.system!==null});}
/** Narrow constructor tokens are produced by this singleton only. The shared
 * Native signer must consume these typed tokens, never the returned DATA. */
export function issueOriginalSepoliaUniswapTargetConstructorV4(runtime,plan,index){assert.equal(arguments.length,3);const p=originalPlan(runtime,plan);assert.ok(Number.isSafeInteger(index)&&index>=0&&index<p.data.constructors.length);if(p.issued.has(index))return p.issued.get(index);assert.equal(index,p.receipts.size,'PUBLIC_UNISWAP_TARGET_CONSTRUCTOR_ORDER');const token=Object.freeze(Object.create(null));constructors.set(token,{runtime,plan,index,active:true,signConsumed:p.reopening!==null});p.issued.set(index,token);return token;}
export async function readOriginalSepoliaUniswapTargetConstructorV4(runtime,token){assert.equal(arguments.length,2);const g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_UNISWAP_ORIGINAL_TARGET_CONSTRUCTOR');const p=originalPlan(runtime,g.plan);assertOriginalPagedSepoliaUniswapVenueV4(runtime,p.venue);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);const head=await runtime.block();await checkParent(runtime,p.parent,head);originalPlan(runtime,g.plan);assert.ok(g.active);assertOriginalPagedSepoliaUniswapVenueV4(runtime,p.venue);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_CONSTRUCTOR_V4',plan:p.data,constructor:p.data.constructors[g.index]});}

const rpcQuantity=value=>{assert.match(value,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);return BigInt(value);};
/** Advance only the SAME original, ordered constructor against current
 * canonical inclusion and exact compiled creation/runtime. This does not mint
 * a signer, proof or target-system capability. Native must also retain its own
 * durable signed-wire provenance before supplying the transaction identity. */
export async function advanceOriginalSepoliaUniswapTargetConstructorV4(runtime,plan,token,nativeId){
 assert.equal(arguments.length,4);const p=originalPlan(runtime,plan),g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.plan===plan&&g.active,'PUBLIC_UNISWAP_ORIGINAL_TARGET_CONSTRUCTOR');assert.equal(g.index,p.receipts.size,'PUBLIC_UNISWAP_TARGET_CONSTRUCTOR_ORDER');assert.match(nativeId,/^0x[0-9a-f]{64}$/);
 const grant=await readOriginalSepoliaUniswapTargetConstructorV4(runtime,token),row=grant.constructor,actual=await runtime.receipt(nativeId);assert.ok(actual,'PUBLIC_UNISWAP_TARGET_CONSTRUCTOR_PENDING');await runtime.checkReceipt(actual);const tx=await runtime.transaction(nativeId);
 assert.equal(actual.contractAddress?.toLowerCase(),row.expectedAddress);assert.equal(tx?.hash,nativeId);assert.equal(tx.from?.toLowerCase(),p.data.account);assert.equal(tx.to,null);assert.equal(tx.input,row.creation);assert.equal(rpcQuantity(tx.type),2n);assert.equal(rpcQuantity(tx.chainId),11155111n);assert.equal(rpcQuantity(tx.nonce),BigInt(row.nonce));assert.equal(rpcQuantity(tx.value),0n);assert.deepEqual(tx.accessList,[]);assert.equal(tx.blockHash,actual.blockHash);assert.equal(tx.blockNumber,actual.blockNumber);
 assert.equal(await runtime.code(row.expectedAddress,actual.blockNumber),row.expectedCode,'PUBLIC_UNISWAP_TARGET_COMPILED_CODE');const head=await runtime.block();assert.equal(await runtime.code(row.expectedAddress,head.number),row.expectedCode,'PUBLIC_UNISWAP_TARGET_CURRENT_CODE');await runtime.assertCanonical(actual);await runtime.assertCanonical(head);
 // Recheck after every asynchronous read before the monotonic local advance.
 originalPlan(runtime,plan);assert.equal(p.receipts.size,g.index);assert.ok(g.active);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);p.receipts.set(g.index,freeze(structuredClone(actual)));g.active=false;return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_CONSTRUCTOR_OBSERVED_V4',index:g.index,transactionHash:nativeId,canonical:true,finalized:false,financialAcceptance:false});
}
/** Exactly two zero-value domain registrations follow all five constructors.
 * Caller calldata, address, value, method and ordinal cannot install a grant. */
export function issueOriginalSepoliaUniswapTargetRegistrationV4(runtime,plan,index){
 assert.equal(arguments.length,3);const p=originalPlan(runtime,plan);assert.ok(Number.isSafeInteger(index)&&index>=0&&index<2);assert.equal(p.receipts.size,5,'PUBLIC_UNISWAP_TARGET_CONSTRUCTORS_INCOMPLETE');assert.equal(index,p.registrationReceipts.size,'PUBLIC_UNISWAP_TARGET_REGISTRATION_ORDER');if(p.registrationTokens.has(index))return p.registrationTokens.get(index);const token=Object.freeze(Object.create(null));registrationGrants.set(token,{runtime,plan,index,active:true,signConsumed:p.reopening!==null});p.registrationTokens.set(index,token);return token;
}
export async function readOriginalSepoliaUniswapTargetRegistrationV4(runtime,token){
 assert.equal(arguments.length,2);const g=registrationGrants.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_UNISWAP_ORIGINAL_TARGET_REGISTRATION');const p=originalPlan(runtime,g.plan);assert.equal(p.receipts.size,5,'PUBLIC_UNISWAP_TARGET_CONSTRUCTORS_INCOMPLETE');assert.equal(g.index,p.registrationReceipts.size,'PUBLIC_UNISWAP_TARGET_REGISTRATION_ORDER');assertOriginalPagedSepoliaUniswapVenueV4(runtime,p.venue);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);const head=await runtime.block();await checkParent(runtime,p.parent,head);await Promise.all(p.data.constructors.map(async row=>assert.equal(await runtime.code(row.expectedAddress,head.number),row.expectedCode,'PUBLIC_UNISWAP_TARGET_CURRENT_CODE')));await runtime.assertCanonical(head);originalPlan(runtime,g.plan);assert.ok(g.active);assert.equal(g.index,p.registrationReceipts.size);assertOriginalPagedSepoliaUniswapVenueV4(runtime,p.venue);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_REGISTRATION_V4',plan:p.data,call:p.data.postDeploymentCalls[g.index]});
}
export async function advanceOriginalSepoliaUniswapTargetRegistrationV4(runtime,plan,token,nativeId){
 assert.equal(arguments.length,4);const p=originalPlan(runtime,plan),g=registrationGrants.get(token);assert.ok(g?.runtime===runtime&&g.plan===plan&&g.active,'PUBLIC_UNISWAP_ORIGINAL_TARGET_REGISTRATION');const grant=await readOriginalSepoliaUniswapTargetRegistrationV4(runtime,token),call=grant.call;assert.match(nativeId,/^0x[0-9a-f]{64}$/);const actual=await runtime.receipt(nativeId);assert.ok(actual,'PUBLIC_UNISWAP_TARGET_REGISTRATION_PENDING');await runtime.checkReceipt(actual);const tx=await runtime.transaction(nativeId);assert.equal(tx?.hash,nativeId);assert.equal(tx.from?.toLowerCase(),call.from);assert.equal(tx.to?.toLowerCase(),call.to);assert.equal(tx.input,call.data);assert.equal(rpcQuantity(tx.type),2n);assert.equal(rpcQuantity(tx.chainId),11155111n);assert.equal(rpcQuantity(tx.nonce),BigInt(call.nonce));assert.equal(rpcQuantity(tx.value),0n);assert.deepEqual(tx.accessList,[]);assert.equal(tx.blockHash,actual.blockHash);assert.equal(tx.blockNumber,actual.blockNumber);await runtime.assertCanonical(actual);await readOriginalSepoliaUniswapTargetRegistrationV4(runtime,token);
 assert.equal(p.registrationReceipts.size,g.index);assert.ok(g.active);p.registrationReceipts.set(g.index,freeze(structuredClone(actual)));g.active=false;return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_REGISTRATION_OBSERVED_V4',index:g.index,transactionHash:nativeId,canonical:true,finalized:false,financialAcceptance:false});
}

/** The protected signer can only select the five compiled CREATEs and the two
 * exact zero-value initialization CALLs owned above. A profile copied into a
 * caller object never selects a branch. Consuming permits one signing attempt;
 * the same consumed token remains readable for the durable pre-POST checks. */
function initializationGrant(runtime,token){
 const constructor=constructors.get(token),registration=registrationGrants.get(token),grant=constructor??registration;
 assert.ok(grant?.runtime===runtime&&grant.active,'PUBLIC_UNISWAP_ORIGINAL_TARGET_INITIALIZATION');
 return {grant,kind:constructor?'CREATE':'CALL'};
}
export async function readOriginalSepoliaUniswapTargetInitializationV4(runtime,token){
 assert.equal(arguments.length,2);const {grant,kind}=initializationGrant(runtime,token);
 const data=kind==='CREATE'?await readOriginalSepoliaUniswapTargetConstructorV4(runtime,token):await readOriginalSepoliaUniswapTargetRegistrationV4(runtime,token);
 assert.strictEqual(initializationGrant(runtime,token).grant,grant);
 return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_INITIALIZATION_V4',kind,plan:data.plan,index:grant.index,request:kind==='CREATE'?data.constructor:data.call});
}
export async function consumeOriginalSepoliaUniswapTargetInitializationV4(runtime,token){
 assert.equal(arguments.length,2);const {grant}=initializationGrant(runtime,token);assert.ok(!grant.signConsumed,'PUBLIC_UNISWAP_TARGET_SIGN_ALREADY_CONSUMED');
 const data=await readOriginalSepoliaUniswapTargetInitializationV4(runtime,token);
 assert.strictEqual(initializationGrant(runtime,token).grant,grant);assert.ok(!grant.signConsumed,'PUBLIC_UNISWAP_TARGET_SIGN_ALREADY_CONSUMED');grant.signConsumed=true;return data;
}

function abiGetter(artifact,name,args=[]){const signature=name+'('+args.map(()=> 'address').join(',')+')',entries=artifact.abi.filter(entry=>entry.type==='function'&&entry.name===name&&entry.inputs.map(input=>input.type).join(',')===args.map(()=> 'address').join(','));assert.equal(entries.length,1,'PUBLIC_UNISWAP_FIXED_GETTER');assert.ok(['view','pure'].includes(entries[0].stateMutability));const id=artifact.evm.methodIdentifiers?.[signature]??publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex');assert.match(id,/^[0-9a-f]{8}$/,'PUBLIC_UNISWAP_FIXED_GETTER');return '0x'+id+nativeStaticArguments(args.map(()=>({type:'address'})),args).slice(2);}
const scalarWord=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value)?value:word(value);
async function targetCodeAndGetters(p,head){
 await checkParent(p.runtime,p.parent,head);const {target,router}=p.data;
 await Promise.all(p.data.constructors.map(async row=>assert.equal(await p.runtime.code(row.expectedAddress,head.number),row.expectedCode,'PUBLIC_UNISWAP_TARGET_CURRENT_CODE')));
 const views=[[target.hub.address,p.build.artifacts.hub,target.hub.immutableValues],...target.pools.map(pool=>[pool.address,p.build.artifacts.pool,pool.immutableValues]),[router.address,p.routerBuild.artifact,router.immutable]];
 await Promise.all(views.flatMap(([address,artifact,values])=>Object.entries(values).filter(([key])=>artifact.abi.some(entry=>entry.type==='function'&&entry.name===key&&entry.inputs.length===0)).map(async([key,value])=>assert.equal(await p.runtime.call({to:address,data:abiGetter(artifact,key)},head.number),scalarWord(value),'PUBLIC_UNISWAP_TARGET_GETTER_'+key))));
 await Promise.all(target.pools.flatMap(pool=>[
  (async()=>assert.equal(await p.runtime.call({to:target.hub.address,data:abiGetter(p.build.artifacts.hub,'poolDomain',[pool.address])},head.number),pool.domainCommitment,'PUBLIC_UNISWAP_TARGET_REGISTERED_DOMAIN'))(),
  (async()=>assert.equal(await p.runtime.call({to:target.hub.address,data:abiGetter(p.build.artifacts.hub,'isRegisteredPool',[pool.address])},head.number),word(1),'PUBLIC_UNISWAP_TARGET_REGISTERED_POOL'))(),
  (async()=>assert.equal(await p.runtime.call({to:target.hub.address,data:abiGetter(p.build.artifacts.hub,'pinnedPoolCodeHash',[pool.address])},head.number),pool.codeHash,'PUBLIC_UNISWAP_TARGET_PINNED_POOL'))()
 ]));await p.runtime.assertCanonical(head);
}
/** A ready target is issued only after all seven SAME canonical receipts are
 * finalized and the compiled code/getters/domain registrations are reread.
 * Native must still validate those identities against its protected signed
 * journal; this method grants no ability to sign a target financial CALL. */
export async function finalizeOriginalSepoliaUniswapTargetV4(runtime,plan){
 assert.equal(arguments.length,2);const p=originalPlan(runtime,plan);assert.equal(p.receipts.size,5,'PUBLIC_UNISWAP_TARGET_CONSTRUCTORS_INCOMPLETE');assert.equal(p.registrationReceipts.size,2,'PUBLIC_UNISWAP_TARGET_REGISTRATIONS_INCOMPLETE');
 const lane=readOriginalPagedSepoliaSourceLaneV4(runtime);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.data.policySHA256);const head=await runtime.block('finalized');
 for(const saved of [...p.receipts.values(),...p.registrationReceipts.values()]){assert.ok(rpcQuantity(head.number)>=rpcQuantity(saved.blockNumber),'PUBLIC_UNISWAP_TARGET_FINALITY_PENDING');const actual=await runtime.receipt(saved.transactionHash);assert.deepEqual(actual,saved,'PUBLIC_UNISWAP_TARGET_ORIGINAL_RECEIPT');await runtime.checkReceipt(actual);}
 await targetCodeAndGetters(p,head);originalPlan(runtime,plan);readOriginalPagedSepoliaSourceLaneV4(runtime);
 if(p.system)return p.system;const system=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_SYSTEM_V4',receiverProfile:runtime.profile,keysetId:p.data.keysetId,account:p.data.account,planSHA256:p.data.planSHA256,policySHA256:p.data.policySHA256,chainId:'11155111',router:p.data.router,target:p.data.target,minimum:p.data.minimum,rules:p.data.rules,rulesRoot:p.data.rulesRoot,constructors:p.data.constructors.map((row,index)=>({...row,receipt:p.receipts.get(index)})),registrations:p.data.postDeploymentCalls.map((row,index)=>({...row,receipt:p.registrationReceipts.get(index)})),finalizedHead:{hash:head.hash,number:head.number},trust:'RPC_PROVIDER',independentConsensus:false});if(p.reopening){const captured=p.reopening.system;await runtime.assertCanonical(captured.finalizedHead);assert.ok(rpcQuantity(head.number)>=rpcQuantity(captured.finalizedHead.number),'PUBLIC_UNISWAP_TARGET_CAPTURED_FINALITY');assert.deepEqual({...system,finalizedHead:captured.finalizedHead},captured,'PUBLIC_UNISWAP_TARGET_RECOMPILED_SYSTEM');const restored=freeze(structuredClone(captured));systems.set(restored,p);p.system=restored;return restored;}systems.set(system,p);p.system=system;return system;
}
export function assertOriginalSepoliaUniswapTargetSystemV4(runtime,system){assert.equal(arguments.length,2);const p=systems.get(system);assert.ok(p?.runtime===runtime&&p.system===system&&!p.closed,'PUBLIC_UNISWAP_ORIGINAL_TARGET_SYSTEM');originalPlan(runtime,p.plan);return system;}
export async function assertOriginalSepoliaUniswapTargetReadyV4(runtime,system){
 assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);const p=systems.get(system);await finalizeOriginalSepoliaUniswapTargetV4(runtime,p.plan);const current=await runtime.block();await targetCodeAndGetters(p,current);readOriginalPagedSepoliaSourceLaneV4(runtime);assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);return system;
}
/** Original handle seam for the independent Mixed producer. Returned DATA
 * cannot recreate either handle or modify the existing Source registry. */
export function readOriginalSepoliaUniswapTargetSourceBindingV4(runtime,system){assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);const p=systems.get(system);return Object.freeze({parent:p.parent,venue:p.venue,plan:p.plan});}

async function verifyOriginalTargetNote(runtime,system,result,mode){
 assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);assert.ok(['deposit_intent','withdraw_balance'].includes(mode));const p=systems.get(system),retained=await loadFlatVerifierArtifacts(),entry=retained.verifiers[mode],rows=p.parent.deployments.filter(row=>row.source===entry.source&&row.name==='HonkVerifier');assert.equal(rows.length,1,'PUBLIC_UNISWAP_ORIGINAL_NOTE_VERIFIER');const head=await runtime.block();assert.equal(await runtime.code(rows[0].address,head.number),rows[0].expectedCode);const calldata=nativeProofCalldata(entry.artifact,'verify(bytes,bytes32[])',Buffer.from(result.proof,'hex'),result.publicInputs);assert.equal(await runtime.call({to:rows[0].address,data:calldata},head.number),word(1),'PUBLIC_UNISWAP_ORIGINAL_NOTE_VERIFY');await runtime.assertCanonical(head);assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);return true;
}
const ledgerViews=new WeakMap();
export async function readOriginalSepoliaUniswapFlatLedgerV4(runtime,system){
 assert.equal(arguments.length,2);await assertOriginalSepoliaUniswapTargetReadyV4(runtime,system);const p=systems.get(system);await readOriginalPagedSepoliaUniswapVenueV4(p.venue);const head=await runtime.block(),view=await readSepoliaUniswapFlatLedgerDataV4(runtime,system,head);assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);ledgerViews.set(view,{runtime,system});return view;
}
export async function assertOriginalSepoliaUniswapFlatLedgerCurrentV4(runtime,system,view){
 assert.equal(arguments.length,3);const original=ledgerViews.get(view);assert.ok(original?.runtime===runtime&&original.system===system,'PUBLIC_UNISWAP_ORIGINAL_LEDGER_VIEW');await runtime.assertCanonical(view.head);const latest=await readOriginalSepoliaUniswapFlatLedgerV4(runtime,system);assert.deepEqual(latest.raw,view.raw,'PUBLIC_UNISWAP_OUTPUT_LEDGER_CHANGED');assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);return view;
}
const originalFlatJournal=buildSepoliaUniswapFlatJournalDataV4(Object.freeze({assertOriginalTarget:(...args)=>assertOriginalSepoliaUniswapTargetSystemV4(...args),assertOriginalTargetReady:(...args)=>assertOriginalSepoliaUniswapTargetReadyV4(...args),readOriginalTarget:(runtime,system)=>assertOriginalSepoliaUniswapTargetSystemV4(runtime,system),verifyOriginalDepositIntent:(...args)=>verifyOriginalTargetNote(...args,'deposit_intent'),verifyOriginalWithdrawal:(...args)=>verifyOriginalTargetNote(...args,'withdraw_balance'),readOriginalLedger:(...args)=>readOriginalSepoliaUniswapFlatLedgerV4(...args),assertOriginalLedgerCurrent:(...args)=>assertOriginalSepoliaUniswapFlatLedgerCurrentV4(...args)}));
export const createOriginalSepoliaUniswapFlatJournalV4=(...args)=>originalFlatJournal.create(...args);
export const assertOriginalSepoliaUniswapFlatJournalV4=(...args)=>originalFlatJournal.assertBundle(...args);
export const issueOriginalSepoliaUniswapFlatPermissionV4=(...args)=>originalFlatJournal.issue(...args);
export const consumeOriginalSepoliaUniswapFlatPermissionV4=(...args)=>originalFlatJournal.consume(...args);
export const readOriginalSepoliaUniswapFlatPermissionV4=(...args)=>originalFlatJournal.readPermission(...args);
export const registerOriginalSepoliaUniswapFlatProofV4=(...args)=>originalFlatJournal.register(...args);
export const readOriginalSepoliaUniswapFlatProofV4=(...args)=>originalFlatJournal.readSlot(...args);
export const validateOriginalSepoliaUniswapFlatDeliveryPlanV4=(...args)=>originalFlatJournal.planForSlot(...args);
export const bindOriginalSepoliaUniswapFlatDeliveryHandoffV4=(...args)=>originalFlatJournal.bindHandoff(...args);
export const readOriginalSepoliaUniswapFlatDeliveryHandoffV4=(...args)=>originalFlatJournal.readHandoff(...args);
/** Captured Original slot observation only; cannot arm a delivery. */
export const readOriginalSepoliaUniswapFlatRetainedDeliveryHandoffV5=(...args)=>originalFlatJournal.readRetainedHandoff(...args);
export const registerOriginalSepoliaUniswapFlatWithdrawalProofV4=(...args)=>originalFlatJournal.registerWithdrawal(...args);
export const armOriginalSepoliaUniswapFlatWithdrawalCommandV4=(...args)=>originalFlatJournal.armWithdrawal(...args);
export const readOriginalSepoliaUniswapFlatWithdrawalCommandV4=(...args)=>originalFlatJournal.readWithdrawalCommand(...args);
export const consumeOriginalSepoliaUniswapFlatWithdrawalCommandV4=(...args)=>originalFlatJournal.consumeWithdrawalCommand(...args);
export const closeOriginalSepoliaUniswapFlatJournalV4=(...args)=>originalFlatJournal.close(...args);

/** Capture DATA only from the same finalized Original Target and journal. */
export async function retainOriginalSepoliaUniswapTargetV4(runtime,system){
 assert.equal(arguments.length,2);await assertOriginalSepoliaUniswapTargetReadyV4(runtime,system);const p=systems.get(system);assertOriginalSepoliaUniswapTargetSystemV4(runtime,system);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_RETENTION_V4',plan:structuredClone(p.data),system:structuredClone(system)});
}
export const retainOriginalSepoliaUniswapFlatJournalV4=(...args)=>originalFlatJournal.retain(...args);

/** Only the one-use Target component of an authenticated Mixed supervisor can
 * select retained domains/nonce. It recompiles exactly; initialization tokens
 * created on this path are observation-only and cannot be consumed for sign. */
export async function prepareOriginalSepoliaUniswapTargetReopenV4(runtime,parent,venue,targetToken){
 assert.equal(arguments.length,4);assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,parent);assertOriginalPagedSepoliaUniswapVenueV4(runtime,venue);assert.ok(!parentAttempts.has(parent)&&!targetBirths.has(parent),'PUBLIC_UNISWAP_TARGET_ALREADY_OWNED');
 const saved=consumeOriginalPagedPublicUniswapMixedComponentV4(targetToken,'target');assert.ok(saved&&Object.getPrototypeOf(saved)===Object.prototype);assert.deepEqual(Object.keys(saved).sort(),['plan','profile','system']);assert.equal(saved.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_RETENTION_V4');assert.equal(saved.plan.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_PLAN_V4');assert.equal(saved.system.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_SYSTEM_V4');assert.equal(saved.plan.keysetId,runtime.metadata.keysetId);assert.equal(saved.plan.account,runtime.accounts[0]);assert.equal(saved.plan.predecessor,parent.pool);assert.equal(saved.plan.planSHA256,saved.system.planSHA256);assert.equal(saved.plan.chainId,'11155111');assert.match(saved.plan.startNonce,/^(?:0|[1-9][0-9]*)$/);const nonce=BigInt(saved.plan.startNonce);assert.ok(nonce+7n<1n<<64n);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,saved.plan.policySHA256);
 return prepareTarget(runtime,parent,venue,nonce,freeze(structuredClone(saved)));
}

export const reopenOriginalSepoliaUniswapFlatJournalV4=(...args)=>originalFlatJournal.reopen(...args);
export const registerOriginalSepoliaUniswapFlatRetainedProofV4=(...args)=>originalFlatJournal.registerRetained(...args);

export const assertOriginalSepoliaUniswapFlatProofSlotV5=(...args)=>originalFlatJournal.assertProofSlot(...args);

/** Disposal checks original ownership only. An expired/closed shared receiver
 * cannot prevent deleting this Target's private preparation capabilities. */
export function closeOriginalSepoliaUniswapTargetSystemV5(runtime,system){
 assert.equal(arguments.length,2);const p=systems.get(system);assert.ok(p?.runtime===runtime&&p.system===system,'PUBLIC_UNISWAP_ORIGINAL_TARGET_SYSTEM');if(p.closed)return;p.closed=true;for(const token of p.issued.values()){const g=constructors.get(token);if(g)g.active=false;}for(const token of p.registrationTokens.values()){const g=registrationGrants.get(token);if(g)g.active=false;}
}
