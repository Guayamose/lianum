/** Quote/review DATA from the supplied Original read-only venue. ACCESS is
 * authenticated and consumed by the HTTP owner before calling this leaf. This
 * module owns no account, signing, authorization or financial command. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import * as R from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {quoteOriginalAaveSepoliaSharesV4,readOriginalAaveSepoliaPublicPositionV4} from '../../chains/evm/vault/aave-sepolia-original-v4.mjs';
import {quoteOriginalMorphoV2SepoliaSharesV4,readOriginalMorphoV2SepoliaPublicPositionV4} from '../../chains/evm/vault/morpho-v2-sepolia-original-v4.mjs';

// Fixed PUBLIC Sepolia demo proposal bounds. These do not replace the user's
// signed exact review or the Source's independently checked gas/value budgets.
export const PUBLIC_SEPOLIA_DEFI_PROPOSAL_LIMITS_V8=Object.freeze({maximumInputAtomic:'10000000',maximumAaveShares:'10000000',maximumMorphoShares:'10000000000000000000',windowSeconds:900,slippageBasisPoints:100});
export const DEVICE_SEPOLIA_DEFI_PROPOSAL_FIELDS_V8=Object.freeze(['protocol','action','rootId','noteRevision','sharesAtomic','maximumInputAtomic','minimumAssetsAtomic','underlyingReceiver','shareWithdrawalRecipient','receiptCommitment']);
export function normalizeDeviceSepoliaDefiProposalRequestDataV8(raw){
 assert.equal(arguments.length,1);const q=P.externalFlatExactV1(raw,DEVICE_SEPOLIA_DEFI_PROPOSAL_FIELDS_V8);
 assert.ok(['AAVE_STATIC','MORPHO_V2'].includes(q.protocol)&&['INVEST','REDEEM'].includes(q.action),'SEPOLIA_DEFI_PROPOSAL_ACTION');P.externalFlatUintV1(q.sharesAtomic);assert.ok(BigInt(q.sharesAtomic)>0n);
 if(q.action==='INVEST'){assert.match(q.receiptCommitment,/^[0-9a-f]{64}$/,'SEPOLIA_DEFI_PROPOSAL_RECEIPT_COMMITMENT');assert.notEqual(q.receiptCommitment,'0'.repeat(64),'SEPOLIA_DEFI_PROPOSAL_RECEIPT_COMMITMENT');}else assert.equal(q.receiptCommitment,null,'SEPOLIA_DEFI_PROPOSAL_RECEIPT_COMMITMENT');
 const bound=PUBLIC_SEPOLIA_DEFI_PROPOSAL_LIMITS_V8,maximumShares=q.protocol==='AAVE_STATIC'?bound.maximumAaveShares:bound.maximumMorphoShares;assert.ok(BigInt(q.sharesAtomic)<=BigInt(maximumShares),'SEPOLIA_DEFI_PROPOSAL_SHARE_LIMIT');
 return q;
}
export async function readDeviceSepoliaDefiProposalDataV8(runtime,original,raw){
 assert.equal(arguments.length,3);const q=normalizeDeviceSepoliaDefiProposalRequestDataV8(raw),bound=PUBLIC_SEPOLIA_DEFI_PROPOSAL_LIMITS_V8;assert.equal(original.protocol,q.protocol,'SEPOLIA_DEFI_PROPOSAL_ACCOUNT_PROTOCOL');const target=original.target;
 assert.equal(q.shareWithdrawalRecipient,target.account,'SEPOLIA_DEFI_PROPOSAL_ORIGINAL_TEMPORARY_CUSTODY');assert.ok(![target.account,target.delivery.address,target.exit.address,...target.target.pools.map(row=>row.address)].includes(q.underlyingReceiver),'SEPOLIA_DEFI_PROPOSAL_USER_DESTINATION');
 let view;
 if(q.protocol==='AAVE_STATIC')view=q.action==='INVEST'?(await quoteOriginalAaveSepoliaSharesV4(original.venue,q.sharesAtomic)).view:await readOriginalAaveSepoliaPublicPositionV4(original.venue,target.target.pools[1].address,q.sharesAtomic,'latest');
 else view=q.action==='INVEST'?(await quoteOriginalMorphoV2SepoliaSharesV4(original.venue,q.sharesAtomic)).view:await readOriginalMorphoV2SepoliaPublicPositionV4(original.venue,target.target.pools[1].address,q.sharesAtomic,'latest');
 assert.equal(view.shares,q.sharesAtomic);assert.equal(view.chainId,'11155111');assert.equal(view.genesis,'0x'+original.descriptor.poolTerms.genesis);await runtime.assertCanonical(view.head);
 const validFrom=BigInt(view.head.timestamp),captureEnd=BigInt(Math.floor((original.policy.expiresAt-30*60000)/1000)),proposedEnd=validFrom+BigInt(bound.windowSeconds),validUntil=proposedEnd<captureEnd?proposedEnd:captureEnd;
 assert.ok(validUntil>validFrom+60n&&validUntil>BigInt(Math.floor(Date.now()/1000))+60n,'SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW');
 const quoteInput=BigInt(view.maximumInputAtomic),quoteAssets=BigInt(view.estimatedUnderlyingAtomic);assert.ok(quoteInput>0n&&quoteAssets>0n&&quoteInput<=BigInt(bound.maximumInputAtomic),'SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT');
 let maximumInputAtomic=null,minimumAssetsAtomic=null;
 if(q.action==='INVEST'){
  assert.equal(q.minimumAssetsAtomic,null);const maximum=(quoteInput*BigInt(10000+bound.slippageBasisPoints)+9999n)/10000n,ceiling=q.maximumInputAtomic===null?maximum:BigInt(P.externalFlatUintV1(q.maximumInputAtomic));assert.ok(ceiling>0n&&ceiling<=BigInt(bound.maximumInputAtomic),'SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT');const selected=ceiling<maximum?ceiling:maximum;assert.ok(selected>=quoteInput&&selected<=BigInt(bound.maximumInputAtomic),'SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT');maximumInputAtomic=selected.toString();
 }else{
  assert.equal(q.maximumInputAtomic,null);assert.ok(BigInt(view.underlyingLiquidityAtomic)>=quoteAssets,'SEPOLIA_DEFI_PROPOSAL_LIQUIDITY');const minimum=quoteAssets*BigInt(10000-bound.slippageBasisPoints)/10000n,floor=q.minimumAssetsAtomic===null?minimum:BigInt(P.externalFlatUintV1(q.minimumAssetsAtomic));assert.ok(floor>0n&&floor<=quoteAssets,'SEPOLIA_DEFI_PROPOSAL_MINIMUM_OUTPUT');const selected=floor>minimum?floor:minimum;assert.ok(selected>0n&&selected<=quoteAssets,'SEPOLIA_DEFI_PROPOSAL_MINIMUM_OUTPUT');minimumAssetsAtomic=selected.toString();
 }
 const review=R.normalizeDeviceSepoliaDefiReviewV4({profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_V4,protocol:original.protocol,action:q.action,descriptor:original.descriptor,rootId:q.rootId,noteRevision:q.noteRevision,reference:randomBytes(32).toString('hex'),shares:q.sharesAtomic,maximumInputAtomic,minimumAssetsAtomic,underlyingReceiver:q.underlyingReceiver,shareWithdrawalRecipient:target.account,validFrom:validFrom.toString(),validUntil:validUntil.toString(),receiptCommitment:q.receiptCommitment});
 await runtime.assertCanonical(view.head);return Object.freeze({review});
}
