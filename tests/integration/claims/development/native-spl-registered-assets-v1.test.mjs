/** Pure registry/asset-domain checks. No owned-runtime brand or credit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeRuleCommitment} from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
import {buildOwnedNativeClaimRules,buildNativeSplClaimRulesV1} from '../../../../packages/backend/src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import {nativeAdmissionRulesTree,nativeAdmissionChainDomain} from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import {nativeSplAssetCommitmentV1,deriveNativeSplConfigurationV1} from '../../../../packages/backend/src/chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import {base58Encode} from '../../../../packages/backend/src/chains/solana/runtime/solana-base58.mjs';
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
 function fixture({lost=false,wrongProvider=false,blockIngress=false}={}){
  let enterIngress,releaseIngress;const ingressEntered=new Promise(resolve=>enterIngress=resolve),ingressGate=new Promise(resolve=>releaseIngress=resolve),lostError=Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');
  const events=[],proof=Object.freeze({proof:'inert-public-proof',publicInputs:Object.freeze(['inert-original-public-inputs'])}),service={descriptor:{claimDomain:'d',nativeAssetKind:'SOLANA_SPL_USDC'},async close(){events.push('service-close');}},
    owner={owner:{async prepareDepositIntent(p){assert.equal(p.amount,'17');events.push('D27-prepare');},async createNativeClaimIngressHandoff(){events.push('handoff');return handoff;},async reconcileDepositIntent(){events.push('owner-reconcile');}},ownerProof:{async proveDepositIntent(){events.push('D27-proof');return proof;}},async suspend(){events.push('owner-suspend');},async restart(){events.push('owner-restart');}},
    handoff={select(){return{ownerIdentitySHA256:'i'};}},native={transfers:[],async bindOriginalSourceV1(token){assert.equal(token,sourceToken);events.push('wrap');},async quoteOriginalDepositAmountV1(){events.push('quote');return'17';},async observe(id){assert.equal(id,'original-native-id');events.push('native-observe');return{status:'observed'};},async inventory(){events.push('native-inventory');return{spl:'inert-inventory'};}},
    runtime={accounts:[0,1,2,3,'0x'+'4'.repeat(40)],async time(){return 100n;}},claims={flatSystem:{},configs:[{},{}]},keeper={},provider={},sourceToken={},controller={
      async prepare({handoff:actual}){assert.equal(actual,handoff);events.push('controller-prepare');return Object.freeze({intentId:'original-intent',amount:'17',claimDomain:'d',status:'PREPARED'});},
      async preposition({intentId}){assert.equal(intentId,'original-intent');assert.ok(events.includes('pairing'));events.push('preposition');},
      async ingress({intentId}){assert.equal(intentId,'original-intent');events.push('ingress');if(blockIngress){enterIngress();await ingressGate;}if(lost)throw lostError;},
      async privateNativeReceipt(){return{nativeId:'original-native-id',broadcastAttempts:1};},async issue({handoff:actual}){assert.equal(actual,handoff);events.push('issue');return{status:'ISSUED',submission:{original:true}};},
      async reconcile({operationId}){assert.equal(operationId,'original-intent');events.push('reconcile');return{status:lost?'UNKNOWN':'ISSUED'};},
    },context={runtime,claims,keeper,native,ingressProverIdentity:'p'};
  const names=['assert','types','originalNativeSplClaimSourceContextV1','claimDomainCommitment','assertOwnedFlatNativeProvider','captureOwnedFlatSolanaSourceForSplV1','readOriginalNativeSplClaimMobileInfrastructureV1','createOriginalNativeSplClaimMobileSpendingServiceV1','decodeDepositIntentInputs','decodeNativeSplInventoryV1'];
  const values=[assert,types,(c,o)=>{assert.equal(c,controller);assert.equal(o,owner);return context;},()=> 'd',(p,expected)=>{assert.equal(p,provider);assert.equal(expected.runtime,runtime);if(wrongProvider)throw Error('SPL_SOURCE_ORIGINAL_SOL_PROVIDER');},async p=>{assert.equal(p,provider);events.push('capture-source');return sourceToken;},async()=>{events.push('infrastructure');return{};},async p=>{assert.equal(p.controller,controller);assert.equal(p.ownerIdentitySHA256,'i');assert.equal(p.claimDomain,'d');assert.equal(p.caller,runtime.accounts[4]);assert.ok(events.includes('controller-prepare'));assert.equal(events.includes('preposition'),false);events.push('pairing');return service;},words=>{assert.equal(words,proof.publicInputs);return{amount:'17'};},value=>{assert.equal(value,'inert-inventory');return{nativePrincipalAvailable:'17',nativePrincipalReserved:'0'};}];
  const body=text.replace(/^import[^\n]*;\s*$/gm,'').replace(/^export /gm,'');
  const api=new Function(...names,body+'\nreturn {createOriginalJupiterSplSourceCreditV1,readOriginalJupiterSplSourceCreditV1};')(...values);
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
 const c=fixture({wrongProvider:true});await assert.rejects(c.api.createOriginalJupiterSplSourceCreditV1({controller:c.controller,owner:c.owner,sourceProvider:c.provider}),/SPL_SOURCE_ORIGINAL_SOL_PROVIDER/);assert.deepEqual(c.events,[]);
});
test('fixed USDC mint/program domain binds actual genesis, config and vault; relabelled SOL and caller mint cannot replace it',()=>{
 const input={genesis:solanaGenesis,config:identity.config.address,vault:identity.vault.address};assert.equal(nativeSplAssetCommitmentV1(input),asset);
 for(const change of [{genesis:'5'.repeat(64)},{config:address(6)},{vault:address(7)}])assert.notEqual(nativeSplAssetCommitmentV1({...input,...change}),asset);
 assert.throws(()=>nativeSplAssetCommitmentV1({...input,mint:address(8)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,program:address(9)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,family:'2'}));
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
