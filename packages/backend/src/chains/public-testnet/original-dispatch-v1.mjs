/** Public execution consumes original provider grants, never a supplied READY DTO. */
import assert from 'node:assert/strict';
import {createPublicKey,verify} from 'node:crypto';
import {nativeTransferActionCommitment} from '@lianum/engine/execution/native/dispatch/native-capsules';
import {normalizeDevicePagedProviderQuoteV4,devicePagedProviderQuoteFrameV4,assertDevicePagedProviderQuoteActionV4} from '@lianum/mobile-protocol/device/paged-provider-quote-v4';
import {need} from '../../native-wallet/common-v1.mjs';
import {publicPagedTestnetNetworksV1,PUBLIC_PAGED_TESTNET_PROFILE_V1} from './profile-v1.mjs';
import {publicPagedEndpointV1} from './endpoint-v1.mjs';

/** Shared provider supplies this exact export only for its separately born public
 * brand. An absent seam fails closed before a signing key can be opened. */
export async function readPublicPagedDispatchV1(ports,grant,account,prepared){
 need(ports&&Object.isFrozen(ports)&&typeof ports.readDispatch==='function','PUBLIC_PAGED_ORIGINAL_PROVIDER_SEAM_REQUIRED');
 const row=await ports.readDispatch(grant);
 need(row.classification===PUBLIC_PAGED_TESTNET_PROFILE_V1,'PUBLIC_PAGED_LOCAL_PROVIDER_FORBIDDEN');
 const config=publicPagedTestnetNetworksV1().find(c=>c.network.id===account.networkId);assert.deepEqual(row.rule,config.rule);assert.equal(row.from,account.address);assert.equal(row.action.chainDomain,config.configuration.chainDomain);
 const endpoint=address=>publicPagedEndpointV1(account,row.rule,address);
 assert.equal(row.action.sourceCommitment,endpoint(account.address));assert.equal(row.action.destinationCommitment,endpoint(row.destination));
 if(prepared){assert.equal(prepared.networkId,account.networkId);assert.deepEqual(prepared.account,account);assert.equal(prepared.recipient,row.destination);assert.equal(prepared.amountAtomic,row.action.amount);assert.equal(prepared.wireKeyCommitment,row.action.receiptKeyCommitment);assert.equal(prepared.actionCommitment,nativeTransferActionCommitment(row.action));assert.equal(prepared.id,row.id);assert.equal(prepared.authorizationRoot,row.authorizationRoot);}
 const quote=normalizeDevicePagedProviderQuoteV4(row.quote);need(quote.terms.classification==='PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE','PUBLIC_PAGED_LOCAL_QUOTE_FORBIDDEN');const point=quote.terms.providerPublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(point.slice(2,66),'hex').toString('base64url'),y:Buffer.from(point.slice(66),'hex').toString('base64url')}}),frame=devicePagedProviderQuoteFrameV4(quote.termsSHA256,quote.actionCommitment);try{need(verify('sha256',frame,{key,dsaEncoding:'ieee-p1363'},Buffer.from(quote.signature,'hex')),'PUBLIC_PAGED_QUOTE_SIGNATURE');}finally{frame.fill(0);}assertDevicePagedProviderQuoteActionV4(quote,row.action);assert.equal(quote.actionCommitment,nativeTransferActionCommitment(row.action));assert.equal(quote.terms.deliver.genesis,row.rule.genesis);assert.equal(quote.terms.deliver.assetIdentity,row.rule.asset);assert.equal(quote.terms.deliver.recipient,row.destination);assert.equal(quote.terms.deliver.amountAtomic,row.action.amount);assert.equal(quote.terms.payout.commitment,row.payoutCommitment);assert.equal(quote.terms.payout.amountAtomic,row.payoutAmount);if(prepared)need(BigInt(prepared.feeAtomic)<=BigInt(quote.terms.feeCeiling.amountAtomic),'PUBLIC_PAGED_FEE_CEILING');
 // The issuer revalidates actual authority windows; no local Date/HTTP claim may renew them.
 need(row.head&&BigInt(row.action.executionFrom)<=BigInt(row.head.timestamp)&&BigInt(row.head.timestamp)<BigInt(row.action.executionUntil)&&BigInt(row.head.timestamp)<BigInt(row.action.settleBefore),'PUBLIC_PAGED_EXECUTION_WINDOW');
 return row;
}
