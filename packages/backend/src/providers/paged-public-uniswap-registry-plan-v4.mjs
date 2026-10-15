/** Read-only immutable-generation planning from the SAME original native
 * keyset/rules and fixed original venue. It emits DATA, never a financial
 * constructor token or a mutable extension of the existing three-rule root.
 * The PUBLIC Flat D27 and Mixed source original owners are still required. */
import assert from 'node:assert/strict';
import {assertOriginalPagedPublicTestnetRuntimeV1,readOriginalPagedPublicRuntimeContextV1} from './paged-public-testnet-runtimes-v1.mjs';
import {assertOriginalPagedSepoliaReceiverRuntimeV4,readOriginalPagedSepoliaRpcContextV4} from '../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {assertOriginalPagedSepoliaUniswapVenueV4,readOriginalPagedSepoliaUniswapVenueV4} from '../chains/public-testnet/sepolia-uniswap-venue-v4.mjs';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {nativeAdmissionRulesTree,nativeAdmissionRuleCommitment,nativeAdmissionChainDomain} from '@lianum/engine/execution/native/dispatch/native-admission';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export async function planOriginalPagedPublicUniswapRegistryDataV4(nativeRuntime,receiver,venue){
 assert.equal(arguments.length,3);assertOriginalPagedPublicTestnetRuntimeV1(nativeRuntime);assertOriginalPagedSepoliaReceiverRuntimeV4(receiver);assertOriginalPagedSepoliaUniswapVenueV4(receiver,venue);
 const native=readOriginalPagedPublicRuntimeContextV1(nativeRuntime),rpc=readOriginalPagedSepoliaRpcContextV4(receiver);assert.equal(native.keysetId,rpc.keysetId,'UNISWAP_REGISTRY_ORIGINAL_KEYSET');assert.equal(native.accounts.find(account=>account.networkId==='ethereum-sepolia')?.address,rpc.account.address,'UNISWAP_REGISTRY_ORIGINAL_ACCOUNT');
 assert.equal(native.rules.length,3,'UNISWAP_REGISTRY_THREE_RULE_PREDECESSOR');assert.deepEqual(native.rules.map(r=>r.family),['3','1','2']);
 const view=await readOriginalPagedSepoliaUniswapVenueV4(venue);assert.equal(view.selection,'AAVE_USDC','UNISWAP_REGISTRY_COMPILED_ADAPTER_OUTPUT');
 const code=await receiver.code(view.output.address,view.head.number),codeHash=await receiver.keccak(code),assetIdentity=derivePrivateAssetIdentity('11155111',view.output.address,codeHash),nativeEthereum=native.rules[0];
 assert.equal(nativeEthereum.genesis,view.genesis.slice(2));const rule={family:'3',genesis:view.genesis.slice(2),asset:assetIdentity.slice(2),finalityKind:nativeEthereum.finalityKind,minimumConfirmations:nativeEthereum.minimumConfirmations,maximumEvidenceLifetime:nativeEthereum.maximumEvidenceLifetime,maximumClockSkew:nativeEthereum.maximumClockSkew};
 assert.ok(native.rules.every(r=>r.asset!==rule.asset),'UNISWAP_REGISTRY_DISTINCT_ERC20_ASSET');const before=nativeAdmissionRulesTree(native.rules),after=nativeAdmissionRulesTree([...native.rules,rule]);assert.notEqual(before.root,after.root);await receiver.assertCanonical(view.head);
 assertOriginalPagedPublicTestnetRuntimeV1(nativeRuntime);assertOriginalPagedSepoliaUniswapVenueV4(receiver,venue);
 return freeze({profile:'PUBLIC_PAGED_UNISWAP_IMMUTABLE_REGISTRY_PLAN_DATA_V4',keysetId:native.keysetId,sourceAccount:rpc.account.address,networkId:'ethereum-sepolia',genesis:view.genesis,head:view.head,
  originalRules:structuredClone(native.rules),originalRulesRoot:before.root,proposedRules:[...structuredClone(native.rules),rule],proposedRulesRoot:after.root,uniswap:{rule,chainDomain:nativeAdmissionChainDomain(rule),evidencePolicy:nativeAdmissionRuleCommitment(rule),asset:{assetIdentity,token:view.output.address,codeHash,codeSHA256:view.output.codeSHA256,symbol:'USDC',decimals:6,unit:'atomic',testnetNoMonetaryValue:true}},
  deployment:{reuse:'ORIGINAL_CURRENT_VERIFIERS_AND_LIBRARIES',pagedSourceContracts:3,flatTargetContracts:3,privateRouterContracts:1,poolRegistryLibraryContracts:1,requiredNewContracts:8,requiredDomainRegistrationCalls:2},
  requiresNewSourceAuthorization:true,existingRegistryMutationAllowed:false,existingProviderAcceptsProposedRoot:false,targetD27Prepared:false,financialConstructorIssued:false,dispatchAuthorized:false,privateBalanceCredited:false});
}
