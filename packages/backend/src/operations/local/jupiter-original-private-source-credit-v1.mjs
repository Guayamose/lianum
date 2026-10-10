/** Original private claim SOURCE -> SOL -> Jupiter/Orca -> backed cUSDC.
 * This producer retains the genuine backend owner child; it does not import a
 * mobile root/opening, adopt a Linux reader, or turn a quote into available
 * credit. The caller owns all borrowed authorities and native processes. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {originalNativeSplClaimSourceContextV1} from '../../claims/controller/controller.mjs';
import {claimDomainCommitment} from '../../claims/protocol/framing.mjs';
import {assertOwnedFlatNativeProvider,captureOwnedFlatSolanaSourceForSplV1} from '../../providers/native-provider.mjs';
import {readOriginalNativeSplClaimMobileInfrastructureV1,createOriginalNativeSplClaimMobileSpendingServiceV1} from '../../api/claims/native-claim-http.mjs';
import {decodeDepositIntentInputs} from '../../execution/account/preparation/deposit-intent.mjs';
import {decodeNativeSplInventoryV1} from '../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';

const producers = new WeakMap(), leasedControllers = new WeakSet();
const PROFILE = 'ORIGINAL_JUPITER_SPL_PRIVATE_SOURCE_CREDIT_V1',PRIVATE_PROFILE='ORIGINAL_JUPITER_SPL_PRIVATE_CI51_SOURCE_CREDIT_V2';
const ACCOUNT_ID = 'original_jupiter_spl_source_credit_v1';
const need = (ok, code) => assert.ok(ok, code);
function originalInput(raw) {
  need(raw && !types.isProxy(raw) && Object.getPrototypeOf(raw) === Object.prototype, 'CLAIM_SPL_SOURCE_INPUT');
  assert.deepEqual(Reflect.ownKeys(raw).sort(), ['controller','owner','sourceProvider'], 'CLAIM_SPL_SOURCE_FIELDS');
  const value = {};
  for (const name of ['controller','owner','sourceProvider']) {
    const property = Object.getOwnPropertyDescriptor(raw,name);
    need(property && Object.hasOwn(property,'value') && !types.isProxy(property.value), 'CLAIM_SPL_SOURCE_INPUT');
    value[name] = property.value;
  }
  return value;
}
/** Private finite bootstrap getter. Copies cannot select another service,
 * owner, intent, proof or quote. The handoff/opening never leaves the producer. */
export function readOriginalJupiterSplSourceCreditV1(producer) {
  need(arguments.length === 1, 'CLAIM_SPL_SOURCE_ARITY');
  const s = producers.get(producer); need(s && !s.closed && !s.closing, 'CLAIM_SPL_ORIGINAL_SOURCE_PRODUCER'); s.current();
  return Object.freeze({ profile:s.profile,accountId:ACCOUNT_ID,ownerIdentitySHA256:s.ownerIdentitySHA256,
    claimDomain:s.claimDomain,prepared:s.prepared,proof:s.proof,service:s.service });
}
/** Infra is read from the fixed private local SPL file before any SOURCE wrap.
 * The original SOL provider must already hold its canonical observed delivery;
 * this is not a new source transfer or a caller-selected native amount. */
export async function createOriginalJupiterSplSourceCreditV1(raw){need(arguments.length===1,'CLAIM_SPL_SOURCE_ARITY');return createJupiterSource(raw,false);}
/** SAME backend-local holder; opening remains there and CI51 goes only to its original recipient. */
export async function createOriginalPrivateJupiterSplSourceCreditV2(raw){need(arguments.length===1,'CLAIM_SPL_SOURCE_ARITY');return createJupiterSource(raw,true);}
async function createJupiterSource(raw,privateCI51) {
  const profile=privateCI51?PRIVATE_PROFILE:PROFILE;
  const {controller,owner,sourceProvider} = originalInput(raw);
  const original = originalNativeSplClaimSourceContextV1(controller,owner);
  const {runtime,claims,native,ingressProverIdentity} = original;
  const current = () => {
    const actual = originalNativeSplClaimSourceContextV1(controller,owner);
    for (const name of ['runtime','claims','keeper','native','ingressProverIdentity'])
      assert.equal(actual[name],original[name],'CLAIM_SPL_SOURCE_CONTEXT_CHANGED');
    assertOwnedFlatNativeProvider(sourceProvider,{runtime,system:claims.flatSystem,poolIndex:0,family:'2',recipientIndex:1});
  };
  current(); need(!leasedControllers.has(controller),'CLAIM_SPL_SOURCE_PRODUCER_ONCE');
  leasedControllers.add(controller); // Failed acquisition never permits a replacement SOURCE.
  let service,closed=false,closing=false,closingPromise,funding=null,admitted=false,phase='PREPARING';
  const observations = new Set();let observationTail=Promise.resolve(),ownerResumed=false;
  const live = () => { need(!closed,'CLAIM_SPL_SOURCE_CLOSED'); current(); };
  const open = () => { need(!closing,'CLAIM_SPL_SOURCE_CLOSED'); live(); };
  const shutdown = async () => {
    let first;
    try {
      if (funding) try { await funding; } catch(error) { first = error; }
      for (const observation of observations) try { await observation; } catch(error) { first ??= error; }
      if (service) try { await service.close(); } catch(error) { first ??= error; }
      if (first) throw first;
      return {closed:true,retainedOriginalNativeCustody:true,mobileNativeCustody:false};
    } finally { closed = true; }
  };
  try {
    need(native.transfers.length === 0,'CLAIM_SPL_SOURCE_BEFORE_NATIVE_INGRESS');
    const infrastructure = await readOriginalNativeSplClaimMobileInfrastructureV1(); live();
    const token = await captureOwnedFlatSolanaSourceForSplV1(sourceProvider); live();
    await native.bindOriginalSourceV1(token); live();
    const amount = await native.quoteOriginalDepositAmountV1(); live();
    need(typeof amount === 'string' && /^[1-9][0-9]*$/.exec(amount)?.[0] === amount,'CLAIM_SPL_SOURCE_QUOTE');
    const now = await runtime.time(); live();
    await owner.owner.prepareDepositIntent({amount,validFrom:String(now),validUntil:String(now+86400n),exitRecipient:runtime.accounts[4].slice(2)}); live();
    const proof = await owner.ownerProof.proveDepositIntent(); live();
    const statement = decodeDepositIntentInputs(proof.publicInputs);
    assert.equal(statement.amount,amount,'CLAIM_SPL_SOURCE_ORIGINAL_D27_AMOUNT');
    const claimDomain = claimDomainCommitment(claims.configs[1]);
    const handoff=await owner.owner[privateCI51?'createPrivateNativeClaimIngressHandoffV2':'createNativeClaimIngressHandoff']({claimDomain,ingressProverIdentity,statement});live();
    const ownerIdentitySHA256 = handoff.select().ownerIdentitySHA256;
    const prepared = await controller.prepare({handoff}); live();
    assert.equal(prepared.amount,amount,'CLAIM_SPL_SOURCE_ORIGINAL_PREPARED_AMOUNT');
    assert.equal(prepared.claimDomain,claimDomain,'CLAIM_SPL_SOURCE_ORIGINAL_PREPARED_DOMAIN');
    need(native.transfers.length === 0,'CLAIM_SPL_SOURCE_BEFORE_NATIVE_INGRESS');
    service = await createOriginalNativeSplClaimMobileSpendingServiceV1({controller,accountId:ACCOUNT_ID,
      ownerIdentitySHA256,claimDomain,caller:runtime.accounts[4],...infrastructure}); live();
    assert.equal(service.descriptor.claimDomain,claimDomain,'CLAIM_SPL_SOURCE_PAIRING_DOMAIN');
    assert.equal(service.descriptor.nativeAssetKind,'SOLANA_SPL_USDC','CLAIM_SPL_SOURCE_PAIRING_ASSET');
    need(native.transfers.length === 0,'CLAIM_SPL_SOURCE_PAIRING_BEFORE_NATIVE'); phase = 'PREPARED';
    const finishOriginalIssuance = async () => {
      const receipt=await controller.privateNativeReceipt({operationId:prepared.intentId});live();
      assert.equal(receipt.broadcastAttempts,1,'CLAIM_SPL_SOURCE_ORIGINAL_SEND_REQUIRED');
      need((await native.observe(receipt.nativeId)).status==='observed','CLAIM_NATIVE_FINALITY_UNRESOLVED');live();
      if(privateCI51&&!ownerResumed){await owner.restart();live();ownerResumed=true;}
      const issued=await controller.issue({intentId:prepared.intentId,handoff});live();need(issued.status==='ISSUED','CLAIM_SPL_SOURCE_ISSUANCE_UNRESOLVED');
      if(!privateCI51){await owner.restart();live();}await owner.owner.reconcileDepositIntent(issued.submission);live();
      const inventory=await native.inventory();live();const backing=decodeNativeSplInventoryV1(inventory.spl);
      assert.equal(backing.nativePrincipalAvailable,amount,'CLAIM_SPL_SOURCE_ACTUAL_BACKING');assert.equal(backing.nativePrincipalReserved,'0','CLAIM_SPL_SOURCE_ACTUAL_RESERVED');phase='ISSUED';return issued;
    };
    const state = {profile,current,prepared,proof,service,claimDomain,ownerIdentitySHA256,get closed(){return closed;},get closing(){return closing;}};
    const producer = Object.freeze({profile,descriptor:service.descriptor,
      custody:'BACKEND_LOCAL_QUORUM',mobileNativeCustody:false,automaticFunding:false,
      async fundOriginalOnce() {
        need(arguments.length === 0,'CLAIM_SPL_SOURCE_ARITY'); open();
        need(!admitted,'CLAIM_SPL_SOURCE_ALREADY_ADMITTED'); admitted = true; phase = 'ADMITTED';
        funding = (async () => {
          try {
            await controller.preposition({intentId:prepared.intentId}); live();
            await owner.suspend(); live();
            await controller.ingress({intentId:prepared.intentId}); live();
            return await finishOriginalIssuance();
          } catch(error) { phase = 'UNKNOWN'; throw error; }
        })(); funding.catch(()=>{}); return funding;
      },
      async observeOriginal() {
        need(arguments.length === 0,'CLAIM_SPL_SOURCE_ARITY'); open();
        const observation = observationTail.then(async () => {
          if (funding) await funding.catch(()=>{}); live();
          let observed=await controller.reconcile({operationId:prepared.intentId});live();
          // Only the original admitted, once-sent native ingress can continue
          // to its first CI51/ISSUE after a lost reply. No native/D27 retry or
          // caller-selected intent is accepted. Controller journals both proof
          // and ISSUE admission before their effects and fences uncertainty.
          if(privateCI51&&admitted&&phase==='UNKNOWN'&&observed.status==='HELD_UNISSUED')observed=await finishOriginalIssuance();
          return Object.freeze({phase,status:observed.status,intentId:prepared.intentId,claimDomain,
            privateCreditEstablished:observed.status === 'ISSUED',availablePrivateBalance:null});
        });observationTail=observation.catch(()=>{});
        observations.add(observation); observation.finally(()=>observations.delete(observation)).catch(()=>{});
        return observation;
      },
      close() { need(arguments.length === 0,'CLAIM_SPL_SOURCE_ARITY'); closing = true; return closingPromise ??= shutdown(); },
      toJSON() { throw Error('CLAIM_SPL_SOURCE_CAPABILITY_NOT_SERIALIZABLE'); },
    }); producers.set(producer,state); return producer;
  } catch(error) {
    closing = true; try { await shutdown(); } catch {} throw error;
  }
}
