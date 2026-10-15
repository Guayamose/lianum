/** Imports only a public native payment proposal. The caller then reviews the
 * existing local graph and performs its one original financial approval. */
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {devicePagedAgentDescriptorSHA256V4,devicePagedAgentProposalDigestV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
import {validateNativeAddressV1} from '@lianum/crypto/native-wallet-v1';
import {verifyDevicePagedAgentNativeProposalV4} from './device-paged-agent-api-v4.mjs';
import {readDevicePagedGraphPairingV3} from './device-paged-graph-api-v3.mjs';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_AGENT_PROPOSAL');};
export function prepareDevicePagedAgentProposalPlanV4(rawPairing,rawProposal){
 const pairing=readDevicePagedGraphPairingV3(rawPairing),signed=verifyDevicePagedAgentNativeProposalV4(rawProposal),p=signed.proposal;need(devicePagedAgentDescriptorSHA256V4(pairing.descriptor)===p.descriptorSHA256&&pairing.nativePreparation?.budgetAsset&&pairing.nativePreparation.fundingOrigin==='OPERATOR_TESTNET');P.assertDevicePagedGraphDeadlineV3(pairing.descriptor,p.terms.settleBefore);
 const nodes=p.nodes.map(n=>{const network=pairing.nativePreparation.networks?.find(row=>row.networkId===n.networkId);need(network);validateNativeAddressV1(n.networkId,n.recipient);return Object.freeze({id:n.id,chainDomain:network.chainDomain,evidencePolicy:network.evidencePolicy,dependsOn:Object.freeze([...n.dependsOn]),amount:n.providerPayoutAtomic,intent:Object.freeze({family:network.family,recipient:n.recipient,amount:n.amountAtomic})});}),pages=[];for(let i=0;i<nodes.length;i+=64)pages.push(Object.freeze(nodes.slice(i,i+64)));
 return Object.freeze({profile:'DEVICE_PAGED_AGENT_LOCAL_PREPARATION_PLAN_V4',proposalSHA256:devicePagedAgentProposalDigestV4(p),agentPublicKey:p.agentPublicKey,descriptor:pairing.descriptor,terms:p.terms,pages:Object.freeze(pages),budgetAsset:pairing.nativePreparation.budgetAsset,fundingOrigin:pairing.nativePreparation.fundingOrigin,financiallyAuthorized:false});
}
