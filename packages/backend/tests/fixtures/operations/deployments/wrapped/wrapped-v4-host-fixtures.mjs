/** Public source-only data fixtures. No private key, signer, node, compiler,
 * prover/backend, network transport or production ownership mock is used. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as E from '../../../../../src/chains/evm/transfers/evm-native-value-v2.mjs';
import * as C from '../../../../../src/claims/protocol/registry-envelope-v2.mjs';
import { nativeClaimEndpointCommitment, claimDomainCommitment } from '@lianum/engine/claims/framing';
import { FLAT_HEALTH_FIELDS } from '../../../../../src/chains/shared/health/native-health.mjs';
export const publicVectors = JSON.parse(readFileSync(new URL('./fixtures/wrapped-v4-public-registry.json', import.meta.url))).vectors;
const publicGraph = JSON.parse(readFileSync(new URL('./fixtures/wrapped-v4-public-native-value.json', import.meta.url)));
export const h = label => createHash('sha256').update('PUBLIC-WRAPPED-CLAIM-JOIN-FIXTURE/' + label).digest('hex');
export const f = label => '00' + h(label).slice(2), ZERO = '0'.repeat(64), copy = structuredClone;
export function tree(leaves, depth = 3) {
  const levels = [[...leaves, ...Array((1 << depth) - leaves.length).fill(ZERO)]];
  while (levels.at(-1).length > 1) { const a = levels.at(-1); levels.push(Array.from({length:a.length / 2}, (_, i) => E.sha256(Buffer.from('01'+a[2*i]+a[2*i+1], 'hex')))); }
  return { root: levels.at(-1)[0], paths: levels[0].map((_, i) => ({index:String(i),siblings:levels.slice(0,-1).map((a,d)=>a[(i>>d)^1])})) };
}
export function registrationFixture() {
  const claims = publicVectors.map((vector, i) => {
    const config = copy(vector.config), family = String(i + 1);
    for (const name of ['gateway', 'wrapper', 'pool']) config[name] = h(name + family).slice(0,40);
    for (const name of ['scope', 'policy', 'wrapperAssetIdentity', 'custodyInventoryDomain']) config[name] = h(name + family);
    config.poolDomain = f('poolDomain' + family);
    const endpoint = family === '1' ? '0014' + h('escrow' + family).slice(0,40) : h('escrow' + family);
    config.escrowEndpointCommitment = nativeClaimEndpointCommitment({family,genesis:config.nativeGenesis,asset:config.nativeAsset,endpoint});
    const profile = C.createCustodyProfile({config,sourceSetRoot:vector.custodyProfile.sourceSetRoot});
    return { config, rule:copy(vector.rule), profileCommitment:C.custodyProfileCommitment(profile), profile, sources:copy(vector.sources) };
  });
  const graphSources = claims[0].sources.map((row,i) => ({identity:{...row.identity,endpointIdentity:h('graph-endpoint'+i)},index:String(i)}));
  const sources = tree(graphSources.map(row=>E.sourceCommitment(row.identity)),2);
  graphSources.forEach((row,i)=>row.siblings=sources.paths[i].siblings);
  const graphProfile = {...copy(publicGraph.profile),sourceSetRoot:sources.root};
  const rows = [...claims.map(row=>({kind:'custody',profile:row.profile,sources:row.sources})),{kind:'native-value',profile:graphProfile,sources:graphSources}];
  const t=tree(rows.map(row=>row.kind==='custody'?C.custodyProfileCommitment(row.profile):E.profileCommitment(row.profile)));
  rows.forEach((row,i)=>row.profilePath=t.paths[i]);
  const registry=copy(publicVectors[0].registry);registry.quorum.rulesRoot=t.root;
  claims.forEach(row=>row.config.registryCommitment=E.registryCommitment(registry));
  return { registry, profiles:rows, claims:claims.map(({config,rule,profileCommitment})=>({config,rule,profileCommitment})) };
}
export function currentFixture() {
  const registration=registrationFixture(),head={number:'7',hash:h('receiver-head'),timestamp:'1000'},hubStateSequence='9';
  const inventories=registration.claims.map(({config},i)=>{
    const family=String(i+1),roles=Object.fromEntries(['depositor','escrow','recipient'].map(role=>[role,{endpoint:family==='1'?'0014'+h(role+family).slice(0,40):h(role+family),address:h('address'+role+family)}]));
    const syntheticPrefunding={classification:'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING',amount:'1000000'};
    const accounts=Object.entries(roles).map(([role,pin])=>({role,...pin}));
    const escrow=accounts[1];
    if(family==='1')Object.assign(escrow,{utxos:[{txid:h('coin'),vout:'0',script:roles.escrow.endpoint,amount:'1000000',confirmations:'110',spendable:true,solvable:true,safe:true,locked:false,coinbase:false}],total:'1000000',spendable:'1000000',unlockedSpendable:'1000000',largestSpendableUtxo:'1000000'});
    else Object.assign(escrow,{exists:true,total:'1000000',spendable:'1000000',rentExemptMinimum:'1000'});
    const inventory={family,genesis:config.nativeGenesis,asset:config.nativeAsset,nativeHead:{id:h('native-head'+family),height:'10',...(family==='2'?{slot:'10'}:{})},signingUnresolved:false,escrow,accounts,syntheticPrefunding,
      feeAudit:{actualFees:'0',escrowActualFees:'0',unresolvedEscrowPreparedFees:'0',transfers:[]},...(family==='2'?{finality:'finalized'}:{})};
    let nonceBootstrapPins=null;
    if(family==='2'){
      const names=['classification','genesisGrant','payerPublicKey','nonceAccountPublicKey','authorityPublicKey','bootstrapNativeId','bootstrapTransactionSHA256','bootstrapRentLamports','bootstrapFeeLamports','bootstrapBroadcastAttempts'];
      const infrastructure=Object.fromEntries(['depositor','escrow'].map(role=>{
        const payerPublicKey=h('payer-'+role),nonceAccountPublicKey=h('nonce-account-'+role),authorityPublicKey=roles[role].endpoint;
        return [role,{classification:'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING',genesisGrant:'1000000',payerPublicKey,nonceAccountPublicKey,authorityPublicKey,
          bootstrapNativeId:h('bootstrap-id-'+role).repeat(2),bootstrapTransactionSHA256:h('bootstrap-wire-'+role),bootstrapRentLamports:'1000',bootstrapFeeLamports:'5000',bootstrapBroadcastAttempts:1,
          payerBalance:'994000',nonceRentExemptMinimum:'1000',nonceAccount:{publicKey:nonceAccountPublicKey,owner:ZERO,executable:false,lamports:'1000',authorityPublicKey,durableNonce:h('durable-'+role),lamportsPerSignature:'5000'}}];
      }));
      inventory.nonceInfrastructureByAuthority=infrastructure;
      nonceBootstrapPins=Object.fromEntries(Object.entries(infrastructure).map(([role,value])=>[role,Object.fromEntries(names.map(name=>[name,value[name]]))]));
    }
    return {claimDomain:claimDomainCommitment(config),roles,syntheticPrefunding,nonceBootstrapPins,inventory};
  });
  const gateways=registration.claims.map(({config})=>{
    const healthState=Object.fromEntries(FLAT_HEALTH_FIELDS.slice(0,-2).map(([name,width,kind])=>[name,width===20?config.pool:['bytes','field'].includes(kind)?f(name):'0']));
    Object.assign(healthState,{pool:config.pool,domain:config.poolDomain,hubDomain:config.hubDomain,registryCommitment:config.registryCommitment,stateSequence:hubStateSequence});
    return {claimDomain:claimDomainCommitment(config),claimSequence:'0',intentCount:'0',ticketCount:'0',reservedRefundTickets:'0',nextTicketNonce:'0',wrapperSupply:'0',pendingRedemptions:'0',pendingRefunds:'0',heldUnissued:'0',reservedFees:'0',activePayout:ZERO,revocationState:f('revocation'),intents:[],tickets:[],healthState,poolHeadroom:true};
  });
  return {registration,head,hubStateSequence,gateways,inventories};
}
export function factsFromPublicFrame(vector) {
  const chunks=[],b=Buffer.from(vector.factsFrameHex,'hex');for(let at=0;at<b.length;){const n=b.readUInt32BE(at);at+=4;chunks.push(b.subarray(at,at+n));at+=n;}
  const factsNames=['ledgerNamespace','hubDomain','registryCommitment','ruleCommitment','family','genesis','asset','transactionId','effectIndex','nativeGid','transactionSHA256','wireBindingVersion','wireBindingKind','wireBindingPosition','wireKeyCommitment'];
  const observationNames=['blockId','stateCommitment','blockHeight','observedAt','finalityKind','confirmations','sourceCommitment','destinationCommitment','amount','custodyKind','custodyCommitment','evidenceFrom','evidenceUntil'];
  const nativeContextNames=['observedTipId','observedTipHeight','transactionSlot','parentSlot','observedSlot'];
  let i=2;const group=names=>Object.fromEntries(names.map(name=>{const v=chunks[i++];return [name,v.length>=32?v.toString('hex'):BigInt('0x'+v.toString('hex')).toString()];}));
  return {...group(factsNames),observation:group(observationNames),nativeContext:group(nativeContextNames)};
}
