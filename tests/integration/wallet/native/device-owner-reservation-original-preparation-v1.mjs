/** Fixed private bootstrap for the NEW device U/S profile, never the accepted
 * one-proof D26 profile. No note, owner key, root or caller signer is accepted.
 * This installs the same original provider/recipient as the native wallet;
 * it does not execute native delivery or issue a U/S proof. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {exactRecord} from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
import {assertOwnedNativeValueWalletSystem} from '../../../../packages/backend/src/operations/deployments/native-value/native-value-wallet-binding-v2.mjs';
import {assertOwnedLocalEvmNativeValueV1,assertOwnedLocalEvmV2} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createOwnedNativeValueProviderCustody} from '../../../../packages/backend/src/providers/native-value-provider-v2.mjs';
import {profileCommitment} from '../../../../packages/backend/src/chains/shared/transfers/generic-native-value-v2.mjs';
import {createNativeRecipientProcess} from '../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import {nativeRecipientInvoiceRequest} from '../../../../packages/engine/src/execution/native/recipients/native-recipient-custody.mjs';
import {createGenericBalanceNativePreparation} from '../../../../packages/engine/src/execution/balances/generic-balance-native-preparation.mjs';
import {NATIVE_ADMISSION_LOSS_CLAUSE} from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
const fresh=()=>randomBytes(32).toString('hex');
export async function prepareDeviceOwnerReservationOriginalV1(input){
  assert.equal(arguments.length,1);exactRecord(input,['runtime','system','nativeRuntime','bootstrap']);
  const {runtime,system,nativeRuntime,bootstrap}=input;
  assertOwnedNativeValueWalletSystem(runtime,system);await assertOwnedLocalEvmV2(runtime);
  await assertOwnedLocalEvmNativeValueV1(nativeRuntime);assert.equal(nativeRuntime.metadata.chainId,'1');
  const domain=system.pools[0].domain,now=await runtime.time(),cutoff=now+28800n,operationId=fresh();
  // The original bootstrap aligns its observed receiver clock BEFORE calling
  // this seam. Windows are created once and cannot be renewed by a READ retry.
  const directory=join(nativeRuntime.metadata.scratchDirectory,'original-device-us-provider');mkdirSync(directory,{mode:0o700});
  const custody=await createOwnedNativeValueProviderCustody({runtime,system,poolIndex:0,nativeRuntime,bootstrap,
    profileCommitment:profileCommitment(system.adapterProfiles[0].profile),recipientEndpoint:nativeRuntime.accounts[1],
    terms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,amount:'1000000',executionFrom:String(now),
      executionUntil:String(cutoff-60n),settleBefore:String(cutoff)},acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,
    directory,password:fresh()});
  let recipient;
  try{
    const offer=custody.offer(),expectedTerms={scope:domain.scope,policy:domain.policy,asset:domain.asset,
      hubDomain:domain.hubDomain,registryCommitment:domain.registryCommitment,operationId,slot:0,evidencePolicy:offer.evidencePolicy,
      value:'100',settleBefore:String(cutoff),actionTemplate:offer.actionTemplate};
    recipient=await createNativeRecipientProcess({mode:'create',path:join(runtime.metadata.scratchDirectory,'original-device-us-recipient.vault'),
      password:fresh(),expectedTerms,withdrawalRecipient:runtime.accounts[1].slice(2)});
    const recipientOffer=await recipient.offer(),{settleBefore:_cutoff,...actionTemplate}=offer.actionTemplate;
    const nativePreparation=createGenericBalanceNativePreparation({
      ...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(name=>[name,domain[name]])),operationId,
      fundingNotBefore:String(now),fundingValidUntil:String(cutoff-120n),settleBefore:String(cutoff),
      nodes:[{id:'device_leg_0',dependsOn:[],evidencePolicy:offer.evidencePolicy,actionTemplate,recipientOffer}]});
    const prepared=nativePreparation.nodes[0],invoice=nativeRecipientInvoiceRequest(expectedTerms,recipientOffer,
      {action:prepared.action,deliveryRiskSalt:prepared.deliveryRiskSalt});
    const accepted=await recipient.acceptInvoice(invoice);await custody.bindQuote({recipientCustody:recipient});
    assert.equal((await recipient.acceptedQuote()).deliveryRiskSalt,prepared.deliveryRiskSalt);
    return Object.freeze({nativePreparation,invoiceSignatures:Object.freeze([accepted.invoiceSignature]),custody,recipient,
      deliveryRiskSalt:prepared.deliveryRiskSalt});
  }catch(error){await recipient?.close();await custody.close();throw error;}
}
