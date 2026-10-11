/** Pure registry/asset-domain checks. No owned-runtime brand or credit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {nativeRuleCommitment} from '@lianum/engine/native/native-receipt-binding';
import {buildOwnedNativeClaimRules,buildNativeSplClaimRulesV1} from '../../../../packages/backend/src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import {nativeAdmissionRulesTree,nativeAdmissionChainDomain} from '@lianum/engine/execution/native/dispatch/native-admission';
import {nativeSplAssetCommitmentV1,deriveNativeSplConfigurationV1} from '../../../../packages/backend/src/chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import {base58Encode} from '../../../../packages/backend/src/chains/solana/runtime/solana-base58.mjs';
import {claimReceiptSecret,claimRefundSalt} from '@lianum/engine/claims/framing';
import {ownerCopy,ownerDigest,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2} from '@lianum/custody/owner';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1,sealPrivateProofJobV1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
const bitcoinGenesis='1'.repeat(64),solanaGenesis='2'.repeat(64),address=n=>base58Encode(Buffer.alloc(32,n));
const identity=deriveNativeSplConfigurationV1({payer:address(3),instance:'4'.repeat(64)}),asset=nativeSplAssetCommitmentV1({genesis:solanaGenesis,config:identity.config.address,vault:identity.vault.address});
test('two claim gateways share the same SOL genesis but all three original BTC/SPL/SOL rules are registered and distinct',()=>{
 const baseline=buildOwnedNativeClaimRules({bitcoinGenesis,solanaGenesis}),actual=buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:asset});
 assert.equal(actual.rules.length,2);assert.equal(actual.registeredRules.length,3);assert.deepEqual(actual.registeredRules,[baseline.rules[0],actual.rules[1],baseline.rules[1]]);assert.deepEqual(actual.graphSolanaRule,baseline.rules[1]);assert.equal(actual.rules[1].family,'2');assert.equal(actual.rules[1].genesis,solanaGenesis);assert.notEqual(actual.rules[1].asset,baseline.rules[1].asset);assert.equal(new Set(actual.registeredRules.map(nativeAdmissionChainDomain)).size,3);
 const originalTree=nativeAdmissionRulesTree(actual.registeredRules);assert.equal(actual.root,originalTree.root);assert.deepEqual(actual.paths,originalTree.paths);assert.deepEqual(actual.paths.map(p=>p.index),['0','1','2']);assert.notEqual(actual.root,nativeAdmissionRulesTree(actual.rules).root);
 assert.throws(()=>buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:baseline.rules[1].asset}),/CLAIM_SPL_DISTINCT_REGISTERED_ASSET/);
});

// HOST lifecycle only. The actual producer body runs against explicitly inert
// original runtime/proof/TLS ports; no proof, native balance or ownership brand
// is manufactured or claimed by this fixture.
test('HOST original Jupiter SOURCE producer pairs before ingress, admits once and only observes an uncertain original wire',async()=>{
 const url=new URL('../../../../packages/backend/src/operations/local/jupiter-original-private-source-credit-v1.mjs',import.meta.url);
 const text=readFileSync(existsSync(url)?url:join(ROOT,'wallet-platform/modules/operations/local/jupiter-original-private-source-credit-v1.mjs'),'utf8');
 const {types}=await import('node:util');
 function fixture({lost=false,wrongProvider=false,blockIngress=false,finalizedAfterLost=false}={}){
  let enterIngress,releaseIngress;const ingressEntered=new Promise(resolve=>enterIngress=resolve),ingressGate=new Promise(resolve=>releaseIngress=resolve),lostError=Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');
  const events=[],proof=Object.freeze({proof:'inert-public-proof',publicInputs:Object.freeze(['inert-original-public-inputs'])}),service={descriptor:{claimDomain:'d',nativeAssetKind:'SOLANA_SPL_USDC'},async close(){events.push('service-close');}},
    owner={owner:{async prepareDepositIntent(p){assert.equal(p.amount,'17');events.push('D27-prepare');},async createNativeClaimIngressHandoff(){events.push('handoff');return handoff;},async createPrivateNativeClaimIngressHandoffV2(){events.push('private-handoff');return handoff;},async reconcileDepositIntent(){events.push('owner-reconcile');}},ownerProof:{async proveDepositIntent(){events.push('D27-proof');return proof;}},async suspend(){events.push('owner-suspend');},async restart(){events.push('owner-restart');}},
    handoff={select(){return{ownerIdentitySHA256:'i'};}},native={transfers:[],async bindOriginalSourceV1(token){assert.equal(token,sourceToken);events.push('wrap');},async quoteOriginalDepositAmountV1(){events.push('quote');return'17';},async observe(id){assert.equal(id,'original-native-id');events.push('native-observe');return{status:'observed'};},async inventory(){events.push('native-inventory');return{spl:'inert-inventory'};}},
    runtime={accounts:[0,1,2,3,'0x'+'4'.repeat(40)],async time(){return 100n;}},claims={flatSystem:{},configs:[{},{}]},keeper={},provider={},sourceToken={},controller={
      async prepare({handoff:actual}){assert.equal(actual,handoff);events.push('controller-prepare');return Object.freeze({intentId:'original-intent',amount:'17',claimDomain:'d',status:'PREPARED'});},
      async preposition({intentId}){assert.equal(intentId,'original-intent');assert.ok(events.includes('pairing'));events.push('preposition');},
      async ingress({intentId}){assert.equal(intentId,'original-intent');events.push('ingress');if(blockIngress){enterIngress();await ingressGate;}if(lost)throw lostError;},
      async privateNativeReceipt(){return{nativeId:'original-native-id',broadcastAttempts:1};},async issue({handoff:actual}){assert.equal(actual,handoff);events.push('issue');return{status:'ISSUED',submission:{original:true}};},
      async reconcile({operationId}){assert.equal(operationId,'original-intent');events.push('reconcile');return{status:events.includes('issue')?'ISSUED':lost?(finalizedAfterLost?'HELD_UNISSUED':'UNKNOWN'):'ISSUED'};},
    },context={runtime,claims,keeper,native,ingressProverIdentity:'p'};
  const names=['assert','types','originalNativeSplClaimSourceContextV1','claimDomainCommitment','assertOwnedFlatNativeProvider','captureOwnedFlatSolanaSourceForSplV1','readOriginalNativeSplClaimMobileInfrastructureV1','createOriginalNativeSplClaimMobileSpendingServiceV1','decodeDepositIntentInputs','decodeNativeSplInventoryV1'];
  const values=[assert,types,(c,o)=>{assert.equal(c,controller);assert.equal(o,owner);return context;},()=> 'd',(p,expected)=>{assert.equal(p,provider);assert.equal(expected.runtime,runtime);if(wrongProvider)throw Error('SPL_SOURCE_ORIGINAL_SOL_PROVIDER');},async p=>{assert.equal(p,provider);events.push('capture-source');return sourceToken;},async()=>{events.push('infrastructure');return{};},async p=>{assert.equal(p.controller,controller);assert.equal(p.ownerIdentitySHA256,'i');assert.equal(p.claimDomain,'d');assert.equal(p.caller,runtime.accounts[4]);assert.ok(events.includes('controller-prepare'));assert.equal(events.includes('preposition'),false);events.push('pairing');return service;},words=>{assert.equal(words,proof.publicInputs);return{amount:'17'};},value=>{assert.equal(value,'inert-inventory');return{nativePrincipalAvailable:'17',nativePrincipalReserved:'0'};}];
  const body=text.replace(/^import[^\n]*;\s*$/gm,'').replace(/^export /gm,'');
  const api=new Function(...names,body+'\nreturn {createOriginalJupiterSplSourceCreditV1,createOriginalPrivateJupiterSplSourceCreditV2,readOriginalJupiterSplSourceCreditV1};')(...values);
  return{api,controller,owner,provider,events,service,ingressEntered,releaseIngress,lostError};
 }
 const a=fixture(),producer=await a.api.createOriginalJupiterSplSourceCreditV1({controller:a.controller,owner:a.owner,sourceProvider:a.provider}),before=a.events.slice();
 assert.deepEqual(before,['infrastructure','capture-source','wrap','quote','D27-prepare','D27-proof','handoff','controller-prepare','pairing']);
 const context=a.api.readOriginalJupiterSplSourceCreditV1(producer);assert.equal(context.service,a.service);assert.equal(context.prepared.status,'PREPARED');
 assert.equal(producer.custody,'BACKEND_LOCAL_QUORUM');assert.equal(producer.mobileNativeCustody,false);
 assert.throws(()=>a.api.readOriginalJupiterSplSourceCreditV1({...producer}),/CLAIM_SPL_ORIGINAL_SOURCE_PRODUCER/);
 assert.throws(()=>JSON.stringify(producer),/CLAIM_SPL_SOURCE_CAPABILITY_NOT_SERIALIZABLE/);
 assert.equal((await producer.fundOriginalOnce()).status,'ISSUED');
 await assert.rejects(producer.fundOriginalOnce(),/CLAIM_SPL_SOURCE_ALREADY_ADMITTED/);assert.equal(a.events.filter(e=>e==='ingress').length,1);
 const count=a.events.filter(e=>e==='ingress'||e==='issue').length;assert.equal((await producer.observeOriginal()).status,'ISSUED');assert.equal(a.events.filter(e=>e==='ingress'||e==='issue').length,count);
 await producer.close();assert.equal(a.events.at(-1),'service-close');assert.throws(()=>a.api.readOriginalJupiterSplSourceCreditV1(producer),/CLAIM_SPL_ORIGINAL_SOURCE_PRODUCER/);
 const b=fixture({lost:true}),uncertain=await b.api.createOriginalJupiterSplSourceCreditV1({controller:b.controller,owner:b.owner,sourceProvider:b.provider});
 await assert.rejects(uncertain.fundOriginalOnce(),/SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE/);
 const observed=await uncertain.observeOriginal();assert.equal(observed.status,'UNKNOWN');assert.equal(observed.availablePrivateBalance,null);assert.equal(observed.privateCreditEstablished,false);
 await assert.rejects(uncertain.fundOriginalOnce(),/CLAIM_SPL_SOURCE_ALREADY_ADMITTED/);assert.equal(b.events.filter(e=>e==='ingress').length,1);assert.equal(b.events.includes('issue'),false);
 await assert.rejects(uncertain.close(),error=>error===b.lostError);assert.equal(b.events.at(-1),'service-close');
 const d=fixture({blockIngress:true}),draining=await d.api.createOriginalJupiterSplSourceCreditV1({controller:d.controller,owner:d.owner,sourceProvider:d.provider});
 const admitted=draining.fundOriginalOnce();await d.ingressEntered;
 const close=draining.close();assert.equal(draining.close(),close);let settled=false;close.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);
 assert.equal(d.events.includes('service-close'),false);assert.equal(d.events.includes('owner-suspend'),true);
 await assert.rejects(draining.fundOriginalOnce(),/CLAIM_SPL_SOURCE_CLOSED/);
 await assert.rejects(draining.observeOriginal(),/CLAIM_SPL_SOURCE_CLOSED/);
 assert.throws(()=>d.api.readOriginalJupiterSplSourceCreditV1(draining),/CLAIM_SPL_ORIGINAL_SOURCE_PRODUCER/);
 assert.equal(d.events.filter(e=>e==='ingress').length,1);d.releaseIngress();assert.equal((await admitted).status,'ISSUED');
 assert.equal((await close).closed,true);assert.equal(d.events.filter(e=>e==='issue').length,1);assert.equal(d.events.at(-1),'service-close');assert.equal(draining.close(),close);
 const p=fixture(),privateSource=await p.api.createOriginalPrivateJupiterSplSourceCreditV2({controller:p.controller,owner:p.owner,sourceProvider:p.provider});
 assert.equal(privateSource.profile,'ORIGINAL_JUPITER_SPL_PRIVATE_CI51_SOURCE_CREDIT_V2');assert.equal(privateSource.custody,'BACKEND_LOCAL_QUORUM');assert.equal(privateSource.mobileNativeCustody,false);assert.equal(p.events.includes('private-handoff'),true);assert.equal(p.events.includes('handoff'),false);
 assert.equal((await privateSource.fundOriginalOnce()).status,'ISSUED');assert.equal(p.events.filter(v=>v==='owner-restart').length,1);assert.ok(p.events.indexOf('native-observe')<p.events.indexOf('owner-restart'));assert.ok(p.events.indexOf('owner-restart')<p.events.indexOf('issue'));assert.ok(p.events.indexOf('issue')<p.events.indexOf('owner-reconcile'));await privateSource.close();
 const recoveredPort=fixture({lost:true,finalizedAfterLost:true}),recovering=await recoveredPort.api.createOriginalPrivateJupiterSplSourceCreditV2({controller:recoveredPort.controller,owner:recoveredPort.owner,sourceProvider:recoveredPort.provider});
 await assert.rejects(recovering.fundOriginalOnce(),error=>error===recoveredPort.lostError);assert.equal(recoveredPort.events.includes('issue'),false);assert.equal(recoveredPort.events.includes('owner-restart'),false);
 const recovered=await recovering.observeOriginal();assert.equal(recovered.status,'ISSUED');assert.equal(recovered.availablePrivateBalance,null);assert.equal(recoveredPort.events.filter(v=>v==='ingress').length,1);assert.equal(recoveredPort.events.filter(v=>v==='D27-proof').length,1);assert.equal(recoveredPort.events.filter(v=>v==='owner-restart').length,1);assert.equal(recoveredPort.events.filter(v=>v==='issue').length,1);
 assert.equal((await recovering.observeOriginal()).status,'ISSUED');assert.equal(recoveredPort.events.filter(v=>v==='issue').length,1);await assert.rejects(recovering.fundOriginalOnce(),/ALREADY_ADMITTED/);await assert.rejects(recovering.close(),error=>error===recoveredPort.lostError);assert.equal(recoveredPort.events.at(-1),'service-close');
 const c=fixture({wrongProvider:true});await assert.rejects(c.api.createOriginalJupiterSplSourceCreditV1({controller:c.controller,owner:c.owner,sourceProvider:c.provider}),/SPL_SOURCE_ORIGINAL_SOL_PROVIDER/);assert.deepEqual(c.events,[]);
});
test('fixed USDC mint/program domain binds actual genesis, config and vault; relabelled SOL and caller mint cannot replace it',()=>{
 const input={genesis:solanaGenesis,config:identity.config.address,vault:identity.vault.address};assert.equal(nativeSplAssetCommitmentV1(input),asset);
 for(const change of [{genesis:'5'.repeat(64)},{config:address(6)},{vault:address(7)}])assert.notEqual(nativeSplAssetCommitmentV1({...input,...change}),asset);
 assert.throws(()=>nativeSplAssetCommitmentV1({...input,mint:address(8)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,program:address(9)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,family:'2'}));
});

test('HOST original CI51 holder keeps opening off parent IPC and seals once to the same recipient',async()=>{
 // Actual holder dispatch/packet producer/WeakMaps and recipient AEAD. The
 // owner Vault/proof builder below are explicitly inert ports; this is no
 // D27/CI51 proof, native finality or custodial ownership acceptance.
 const url=new URL('../../../../packages/backend/src/custody/processes/flat-owner-process.mjs',import.meta.url),text=readFileSync(existsSync(url)?url:join(ROOT,'mobile-core/flat-owner-process.mjs'),'utf8');
 const packetStart=text.indexOf('function privateClaimPacketV2('),packetEnd=text.indexOf('/** Called only inside the fixed child.',packetStart),dispatchStart=text.indexOf("if(message.method==='createPrivateNativeClaimIngressHandoffV2')"),dispatchEnd=text.indexOf("} else if (message.method === 'proveDepositIntent')",dispatchStart);
 const brandStart=text.indexOf('function privateNativeClaimHandoffV2('),brandEnd=text.indexOf('// Runs inside the original holder child',brandStart);
 assert.ok(packetStart>0&&packetEnd>packetStart&&dispatchStart>0&&dispatchEnd>dispatchStart&&brandStart>0&&brandEnd>brandStart);
 const exactRecord=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),keys.slice().sort()),frozen=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;},opaque=v=>Object.freeze(v);
 const legacy={version:1,profile:'EXPLICIT_INERT_LEGACY_HANDOFF',trust:'EXPLICIT_INERT_OWNER_PORT',ownerIdentitySHA256:'11'.repeat(32),claimDomain:'22'.repeat(32),ingressProverIdentity:'33'.repeat(32),intentIdentitySHA256:'44'.repeat(32),revision:0,statement:{output:'55'.repeat(32),amount:'17'},proofResult:{proof:'INERT_PUBLIC_D27'},opening:{rho:'66'.repeat(32),x:'77'.repeat(32),y:'88'.repeat(32),value:'17',noteSecret:'99'.repeat(32)},handoffIdentitySHA256:'aa'.repeat(32)};
 let buildCount=0;const builder=async input=>{buildCount++;assert.deepEqual(input.noteOpening,legacy.opening);assert.equal(input.config,'EXPLICIT_INERT_ORIGINAL_CONFIG');return{statement:{claimDomain:legacy.claimDomain,outputQ:legacy.statement.output,amountQ:'17'},expectedPublicInputs:['17'],inputs:{note_opening:{note_secret:'EXPLICIT_INERT_PRIVATE_CI51_OPENING'},amount:'17'}};};
 const ports={assert,ownerCopy,ownerDigest,FLAT_OWNER_PRIVATE_CLAIM_HANDOFF_V2,FLAT_OWNER_PRIVATE_CLAIM_TRUST_V2,claimReceiptSecret,claimRefundSalt,wipePrivateProofInputsV1,sealPrivateProofJobV1,exactRecord,frozen,opaque,custody:{async createNativeClaimIngressHandoff(v){assert.equal(v.claimDomain,legacy.claimDomain);assert.equal(v.ingressProverIdentity,legacy.ingressProverIdentity);return ownerCopy(legacy);}},buildClaimIngressInputs:builder,withPinnedOwnerHash:work=>work(()=>{throw Error('EXPLICIT_INERT_HASH_UNUSED');})};
 const names=Object.keys(ports),values=Object.values(ports),body='const ownedPrivateNativeClaimHandoffsV2=new WeakMap();'+text.slice(brandStart,brandEnd).replace(/^export /gm,'')+text.slice(packetStart,packetEnd)+'let privateClaimJob=null,privateClaimPrepared=false;async function invoke(message){let result;'+text.slice(dispatchStart,dispatchEnd)+'}else throw Error("HOST_PRIVATE_CI51_FIXED_COMMAND");return result;}return{invoke,mint:(value)=>privateNativeClaimHandoffV2(value,(method,input)=>invoke({method,input})),assertOriginal:assertOwnedPrivateNativeClaimIngressHandoffV2};';
 const holder=new Function(...names,body)(...values),publicPacket=await holder.invoke({method:'createPrivateNativeClaimIngressHandoffV2',input:{claimDomain:legacy.claimDomain,ingressProverIdentity:legacy.ingressProverIdentity,statement:legacy.statement}});
 assert.equal(Object.hasOwn(publicPacket,'opening'),false);assert.equal(JSON.stringify(publicPacket).includes(legacy.opening.noteSecret),false);assert.equal(publicPacket.receiptBinding.secret,claimReceiptSecret({claimDomain:legacy.claimDomain,noteSecret:legacy.opening.noteSecret,outputQ:legacy.statement.output}));
 const original=holder.mint(publicPacket);holder.assertOriginal(original,{claimDomain:legacy.claimDomain});assert.throws(()=>holder.assertOriginal({...original}),/ORIGINAL_PRIVATE_CLAIM_HANDOFF_REQUIRED/);
 const prepared=await original.prepareProof({config:'EXPLICIT_INERT_ORIGINAL_CONFIG'});assert.deepEqual(Object.keys(prepared).sort(),['expectedPublicInputs','statement','witnessSHA256']);assert.equal(JSON.stringify(prepared).includes('EXPLICIT_INERT_PRIVATE_CI51_OPENING'),false);
 const handle=createPrivateProofRecipientV1({relation:'native_claim_ingress',role:'claim_ingress',jobId:'host-private-ci51-recipient'});
 try {
  const recipient=readPrivateProofRecipientV1(handle),sealed=await original.sealProof(recipient);assert.equal(sealed.authorization.witnessSHA256,prepared.witnessSHA256);assert.equal(JSON.stringify(sealed).includes('EXPLICIT_INERT_PRIVATE_CI51_OPENING'),false);
  const opened=openPrivateProofJobV1(handle,sealed.packet);try{assert.equal(opened.inputs.note_opening.note_secret,'EXPLICIT_INERT_PRIVATE_CI51_OPENING');assert.deepEqual(opened.expectedPublicInputs,prepared.expectedPublicInputs);}finally{wipePrivateProofInputsV1(opened.inputs);}
  assert.throws(()=>original.sealProof(recipient),/PREPARATION_REQUIRED/);assert.throws(()=>original.prepareProof({config:'EXPLICIT_INERT_ORIGINAL_CONFIG'}),/ONE_PREPARATION/);assert.equal(buildCount,1);
 }finally{closePrivateProofRecipientV1(handle);}
 const badHolder=new Function(...names,body)(...values),badOriginal=badHolder.mint(publicPacket);await badOriginal.prepareProof({config:'EXPLICIT_INERT_ORIGINAL_CONFIG'});
 const wrong=createPrivateProofRecipientV1({relation:'native_claim_discharge',role:'claim_discharge',jobId:'host-private-ci51-wrong-role'});try{await assert.rejects(badOriginal.sealProof(readPrivateProofRecipientV1(wrong)),/CI51_RELATION/);assert.throws(()=>badOriginal.sealProof(readPrivateProofRecipientV1(wrong)),/PREPARATION_REQUIRED/);}finally{closePrivateProofRecipientV1(wrong);}
});

// HOST metadata only: execute the original post-capability projection and root
// checks. No combined token, observer, key, signing or native account is minted.
test('combined SPL GRAPH paths retain all eight registry leaves without relabelling native SOL or waiving standalone completeness',()=>{
 const tree=buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:asset});
 const graphRules=[tree.rules[0],tree.graphSolanaRule],graphPaths=[tree.paths[0],tree.paths[2]];
 assert.equal(tree.commitments.length,8);assert.deepEqual(tree.commitments.slice(3),Array(5).fill('0'.repeat(64)));
 function source(relative,mapped){const url=new URL(relative,import.meta.url);return readFileSync(existsSync(url)?url:join(ROOT,mapped),'utf8');}
 const claim=source('../../../../packages/backend/src/claims/operations/operators.mjs','wallet-platform/modules/native-claims/operators.mjs');
 const start=claim.indexOf('if (bound.nativeRuntimes.some(',claim.indexOf('assertGraphBinding(binding) {'));
 const end=claim.indexOf('return null;',start)+'return null;'.length;
 assert.ok(start>=0&&end>start);
 const equal=(a,b,message)=>assert.deepEqual(structuredClone(a),structuredClone(b),message);
 function project(rules,spl=true){
  const originalSpl=Object.freeze({});let classified=0;
  const context=createContext({binding:{rules},bound:{nativeRuntimes:[Object.freeze({}),originalSpl],policies:[{rule:tree.rules[0]}],graphSolanaRule:tree.graphSolanaRule,registeredRules:tree.registeredRules},equal,copy:structuredClone,freeze:value=>Object.freeze(value),
   isOwnedSolanaSplCustodyV1(native){assert.equal(arguments.length,1,'SOLANA_SPL_CLASSIFIER_ARITY');classified++;return spl&&native===originalSpl;}});
  const result=new Script('(function(){'+claim.slice(start,end)+'})()').runInContext(context);assert.equal(classified,2);return result;
 }
 assert.deepEqual(project(graphRules),tree.registeredRules);
 assert.equal(project(graphRules,false),null);
 assert.throws(()=>project(tree.rules),/COMBINED_OPERATOR_SPL_NATIVE_GRAPH_RULES/);
 assert.throws(()=>project([graphRules[0],{...graphRules[1],asset}]),/COMBINED_OPERATOR_SPL_NATIVE_GRAPH_RULES/);
 const graph=source('../../../../packages/backend/src/operations/operators/claims/native-operators.mjs','wallet-platform/modules/ops/native-operators.mjs');
 const graphStart=graph.indexOf('const registeredRules = (custody ? assertCombinedGraphBinding');
 const graphEnd=graph.indexOf('equal(rulePaths, graphPaths);',graphStart)+'equal(rulePaths, graphPaths);'.length;
 assert.ok(graphStart>=0&&graphEnd>graphStart);
 function check({combined=true,registered=tree.registeredRules,paths=graphPaths,root=tree.root}={}){
  let calls=0;const context=createContext({custody:combined?Object.freeze({}):null,runtime:null,bitcoin:null,solana:null,rules:graphRules,rulePaths:paths,
   system:{registry:{rulesRoot:root}},assert,nativeRuleCommitment,nativeAdmissionRulesTree,equal,
   assertCombinedGraphBinding(token,binding){calls++;assert.equal(token,context.custody);equal(binding.rules,graphRules);return registered;}});
  new Script(graph.slice(graphStart,graphEnd)).runInContext(context);assert.equal(calls,combined?1:0);
 }
 check();
 // The old two-rule join and any missing/reordered registered asset still fail.
 assert.throws(()=>check({combined:false}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:graphRules}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:[tree.registeredRules[0],tree.registeredRules[2],tree.registeredRules[1]]}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:tree.registeredRules.map((rule,index)=>index===1?{...rule,asset:'9'.repeat(64)}:rule)}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({paths:[tree.paths[0],tree.paths[1]]}));
 assert.throws(()=>check({root:nativeAdmissionRulesTree(graphRules).root}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
});
