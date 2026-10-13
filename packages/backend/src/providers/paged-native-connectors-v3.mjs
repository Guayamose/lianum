/** Original owned native connectors. All networks are isolated local ledgers;
 * a confirmed transfer is never projected as public-network consensus. */
import assert from 'node:assert/strict';
import {evmNativeTransferNetwork} from '../chains/evm/observations/evm-native-transfer-observer.mjs';
import {evmFundingEndpointCommitment} from '../chains/evm/dispatch/evm-facts-binding.mjs';
import {nativeFixtureEndpointCommitment} from '../evidence/native-quorum-observer.mjs';
import {deriveOwnedNativeCurrencyAsset} from '../operations/deployments/claims/native-claim-deployment-plan.mjs';
import {nativeAdmissionChainDomain,nativeAdmissionRuleCommitment,nativeAdmissionRuleToNoir} from '@lianum/engine/execution/native/dispatch/native-admission';

const names={EVM:{family:'3',label:'Ethereum local',assetSymbol:'ETH',decimals:18},BTC:{family:'1',label:'Bitcoin regtest',assetSymbol:'BTC',decimals:8},SOL:{family:'2',label:'Solana local',assetSymbol:'SOL',decimals:9}};
/** Mechanical binding only. The provider obtains these ports from the fixed
 * canonical runtime birth; this module neither creates nor registers owners. */
export async function buildOriginalPagedNativeConnectorsV3(ownedPorts){
  assert.equal(arguments.length,1);assert.ok(Array.isArray(ownedPorts));assert.deepEqual(ownedPorts.map(port=>port.family),['EVM','BTC','SOL']);
  const ports=Object.fromEntries(ownedPorts.map(port=>[port.family,port]));
  const runtimes=Object.fromEntries(ownedPorts.map(port=>[port.family,port.runtime]));
  try{
    for(const port of ownedPorts)port.assertLive();
    await runtimes.EVM.health();await runtimes.BTC.health();
    const network=evmNativeTransferNetwork({chain:'ethereum',genesisHash:runtimes.EVM.metadata.evmGenesis});
    return ['EVM','BTC','SOL'].map(family=>{
      const runtime=runtimes[family],description=names[family],genesis=family==='EVM'?network.genesisHash.slice(2):family==='BTC'?runtime.genesis:runtime.genesisHex.slice(2);
      const asset=family==='EVM'?network.nativeAssetCommitment:deriveOwnedNativeCurrencyAsset({family:description.family,genesis});
      const rule={family:description.family,genesis,asset,finalityKind:description.family,minimumConfirmations:family==='BTC'?'6':family==='SOL'?'0':'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'};
      nativeAdmissionRuleToNoir(rule);
      const destinations=(family==='EVM'?runtime.accounts.slice(1):runtime.recipients).map((address,i)=>Object.freeze({id:family.toLowerCase()+'-'+i,address,label:'Destino '+(i+1)}));
      const configuration=Object.freeze({family,label:description.label,chainDomain:nativeAdmissionChainDomain(rule),evidencePolicy:nativeAdmissionRuleCommitment(rule),assetSymbol:description.assetSymbol,decimals:description.decimals,destinations:Object.freeze(destinations)});
      const assertLive=ports[family].assertLive;
      return {family,runtime,rule,network:family==='EVM'?network:null,configuration,assertLive};
    });
  }catch(error){await Promise.allSettled(Object.values(runtimes).map(runtime=>runtime.close()));throw error;}
}

/** Native amounts and the receiver-note reward are separate quantities. The
 * local quote binds both; no market price or exchange rate is manufactured. */
export async function originalPagedNativeIntentBindingV3(connector,node){
  connector.assertLive();
  const supplied=Object.hasOwn(node,'intent');
  if(supplied){assert.deepEqual(Reflect.ownKeys(node.intent).sort(),['amount','family','recipient']);assert.equal(node.intent.family,connector.family);}
  const amount=supplied?node.intent.amount:node.amount;
  assert.equal(typeof amount,'string');assert.match(amount,/^[1-9][0-9]{0,38}$/);assert.ok(BigInt(amount)<(1n<<128n));
  const legacy=connector.configuration.destinations[Number(BigInt(node.ordinal)%BigInt(connector.configuration.destinations.length))].address;
  const recipient=supplied?node.intent.recipient:legacy;
  assert.equal(typeof recipient,'string');
  const {rule,runtime}=connector;
  if(connector.family==='EVM'){
    assert.match(recipient,/^0x[0-9a-fA-F]{40}$/);const destination=recipient.toLowerCase(),from=runtime.accounts[0];assert.notEqual(destination,from,'PAGED_NATIVE_SELF_PAYMENT');
    const endpoint=address=>evmFundingEndpointCommitment({genesis:rule.genesis,asset:rule.asset,address:address.slice(2)});
    return {amount,destination,from,recipientIndex:null,native:null,sourceCommitment:endpoint(from),destinationCommitment:endpoint(destination)};
  }
  const {recipientIndex}=await runtime.registerPagedRecipient({recipient});
  assert.ok(BigInt(amount)<=(connector.family==='BTC'?1000000000n:BigInt(Number.MAX_SAFE_INTEGER)),'PAGED_NATIVE_NATIVE_AMOUNT_LIMIT');
  const adapter=runtime.adapter({asset:rule.asset,recipientIndex}),native=adapter.binding;
  const endpoint=rawHex=>nativeFixtureEndpointCommitment({family:connector.family,genesis:rule.genesis,asset:rule.asset,rawHex});
  return {amount,destination:recipient,from:connector.family==='BTC'?runtime.source:runtime.solver,recipientIndex,native:structuredClone(native),sourceCommitment:endpoint(native.sourceEndpoint),destinationCommitment:endpoint(native.destinationEndpoint)};
}
