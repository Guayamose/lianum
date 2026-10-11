/** Pure USDC arithmetic alongside the unchanged BTC/SOL audits. This parser
 * grants no owned-runtime brand, observer, registry or native send authority. */
import assert from 'node:assert/strict';
import {bytes32,exactRecord} from '@lianum/components/encoding/commitments';
import {cloneInput,frozenInput} from '@lianum/components/plain-input';
import {NATIVE_SPL_CUSTODY_V1,NATIVE_SPL_CLAIM_INTENT_PROFILE_V1,decodeNativeSplInventoryV1,encodeNativeSplClaimUnsignedWireV1} from '../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import {base58Decode} from '../../chains/solana/runtime/solana-base58.mjs';
import {ownedCustodyFeeAudit} from '../../chains/shared/runtime/owned-native-custody.mjs';
import {claimUint,claimDomainCommitment,nativeClaimEndpointCommitment} from '@lianum/engine/claims/framing';
export const OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1='OWNED_NATIVE_SPL_USDC_INVENTORY_V1';
export function assertNativeSplClaimPreparationV1(raw,config){
 const p=cloneInput(raw);exactRecord(p,['genesis','intent','unsignedWire','funds']);assert.equal(config.nativeFamily,'2');assert.equal(p.genesis,config.nativeGenesis);
 assert.equal(p.intent.profile,NATIVE_SPL_CLAIM_INTENT_PROFILE_V1);assert.equal(p.intent.claimDomain,claimDomainCommitment(config));assert.equal(p.unsignedWire,encodeNativeSplClaimUnsignedWireV1(p.intent),'SPL_PRESIGN_ORIGINAL_UNSIGNED_WIRE');
 assert.equal(p.funds.principalUnit,NATIVE_SPL_CUSTODY_V1.principalUnit);assert.equal(p.funds.feeUnit,NATIVE_SPL_CUSTODY_V1.feeUnit);assert.ok(claimUint(p.funds.feeLamports)>0n);
 assert.equal(p.funds.mint,NATIVE_SPL_CUSTODY_V1.mint);assert.equal(p.funds.tokenProgram,NATIVE_SPL_CUSTODY_V1.tokenProgram);assert.equal(p.funds.custodyProgram,NATIVE_SPL_CUSTODY_V1.program);
 return p;
}
export function auditNativeSplClaimInventoryV1(raw,config,roles){
 const inventory=cloneInput(raw),p=NATIVE_SPL_CUSTODY_V1;assert.equal(inventory.profile,OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1);assert.equal(config.nativeFamily,'2');assert.equal(inventory.family,'2');assert.equal(inventory.genesis,config.nativeGenesis);assert.equal(inventory.asset,config.nativeAsset);
 assert.equal(inventory.finality,'finalized');bytes32(inventory.nativeHead.id,true);claimUint(inventory.nativeHead.height);claimUint(inventory.nativeHead.slot);assert.equal(inventory.signingUnresolved,false);
 assert.equal(inventory.accounts.length,3);for(const role of ['depositor','escrow','recipient']){const rows=inventory.accounts.filter(a=>a.role===role);assert.equal(rows.length,1);const a=rows[0];assert.equal(a.endpoint,roles[role].endpoint);assert.equal(a.address,roles[role].address);assert.equal(a.exists,true);assert.equal(a.owner,p.tokenProgram);assert.equal(a.mint,p.mint);assert.equal(a.principalUnit,p.principalUnit);claimUint(a.total);claimUint(a.rentExemptMinimum);assert.equal(a.total,a.spendable);}
 assert.deepEqual(inventory.escrow,inventory.accounts.find(a=>a.role==='escrow'));assert.equal(nativeClaimEndpointCommitment({family:'2',genesis:config.nativeGenesis,asset:config.nativeAsset,endpoint:inventory.escrow.endpoint}),config.escrowEndpointCommitment);
 const data=Buffer.from(inventory.spl.configData,'hex');assert.equal(data.subarray(72,104).toString('hex'),config.nativeGenesis);assert.equal(data.subarray(104,136).toString('hex'),config.nativeAsset);assert.equal(data.subarray(136,168).toString('hex'),claimDomainCommitment(config));assert.equal(data.subarray(168,200).toString('hex'),config.custodyInventoryDomain);assert.equal(data.subarray(232,264).toString('hex'),config.registryCommitment);assert.equal(data.subarray(264,296).toString('hex'),config.hubDomain);
 assert.equal(inventory.spl.vault,roles.escrow.address);assert.equal(base58Decode(inventory.spl.vault,32).toString('hex'),roles.escrow.endpoint);
 const funds=decodeNativeSplInventoryV1(inventory.spl);assert.equal(inventory.escrow.total,funds.nativePrincipalAvailable);assert.equal(inventory.syntheticPrefunding.classification,'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING');assert.equal(inventory.syntheticPrefunding.origin,'SEPARATE_OWNED_SOL_FEE_PAYER_NOT_SPL_PRINCIPAL');
 const feeAudit=ownedCustodyFeeAudit(inventory.feeAudit.transfers);assert.deepEqual(feeAudit,inventory.feeAudit);assert.ok(new Set(feeAudit.transfers.map(a=>a.nativeId)).size===feeAudit.transfers.length);for(const r of feeAudit.transfers)assert.ok(!r.phase.includes('ADVERSE'));
 // Actual current SOL fee-payer balance already includes config/ticket rent,
 // SOURCE wrapping and authorization costs; no synthetic USDC subtraction.
 return frozenInput({nativeTotal:funds.nativePrincipalAvailable,nativeSpendable:funds.nativePrincipalAvailable,nativePrincipalAvailable:funds.nativePrincipalAvailable,
  feeReserveAvailable:funds.feeReserveAvailable,syntheticFeeLiquiditySurplus:funds.feeReserveAvailable,rentExcluded:funds.feeRentMinimum,unresolvedPreparedFees:feeAudit.unresolvedEscrowPreparedFees,actualFees:feeAudit.actualFees});
}
