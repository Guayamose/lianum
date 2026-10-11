/** Offline host checks with real fixture signatures. hashFields deliberately
 * is not Poseidon2; no compiled circuit, proof, verifier or node is invoked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, sign } from 'node:crypto';
import { buildClaimIngressInputs, buildClaimDischargeInputs } from '@lianum/engine/claims/inputs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimReceiptSecret, claimRefundSalt,
  claimDestinationCommitment, claimIngressReceiptCommitment, claimTicketId, claimTicketSecret,
  claimTicketCommitment, nativeClaimEndpointCommitment, decodeClaimIngressInputs, decodeClaimDischargeInputs }
  from '@lianum/engine/claims/framing';
import { createCommitmentCodec, ZERO } from '@lianum/components/encoding/commitments';
import { balanceCommitment } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { nativeAdmissionRuleRoot, nativeAdmissionChainDomain }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment }
  from '@lianum/engine/evidence/native-quorum';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, receiptKeyCommitment, encodeNativeFacts, nativeFactsDigest,
  nativeAdmissionNullifier } from '@lianum/engine/native/native-receipt-binding';

const h = label => createHash('sha256').update('SYNTHETIC-NATIVE-CLAIMS/' + label).digest('hex');
const hashFields = async fields => '00' + h(fields.map(String).join(':')).slice(2);
const codec = createCommitmentCodec({ hashFields });
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function fixtureSigner(index) {
  const d = Buffer.from(index.toString(16).padStart(64, '0'), 'hex');
  const curve = createECDH('secp256k1'); curve.setPrivateKey(d);
  const point = curve.getPublicKey(null, 'uncompressed'), x = point.subarray(1, 33), y = point.subarray(33);
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    d: d.toString('base64url'), x: x.toString('base64url'), y: y.toString('base64url') } });
  return { publicKey: { x: x.toString('hex'), y: y.toString('hex') }, sign(frame) {
    const signature = sign('sha256', frame, { key, dsaEncoding: 'ieee-p1363' });
    const s = BigInt('0x' + signature.subarray(32).toString('hex'));
    if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
    return signature.toString('hex');
  } };
}
const attesters = [1, 2, 3, 4].map(fixtureSigner), owner = fixtureSigner(5);
const policyFor = raw => ({ ledgerNamespace: raw.config.ledgerNamespace, hubDomain: raw.config.hubDomain,
  registryCommitment: raw.config.registryCommitment, rule: raw.rule });
function resign(raw, facts) {
  const policy = policyFor(raw), frame = encodeNativeFacts(facts, policy);
  raw.certificates = attesters.slice(0, 3).map((attester, index) => ({ schema: FACTS_SCHEMA, signerIndex: String(index),
    facts: structuredClone(facts), frameHex: frame.toString('hex'), digest: nativeFactsDigest(facts, policy),
    signature: attester.sign(frame) }));
}
function updateObserved(facts) {
  const endpoints = { family: facts.family, genesis: facts.genesis, asset: facts.asset,
    sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment };
  facts.observation.custodyCommitment = nativeCustodyCommitment(endpoints);
  facts.observation.stateCommitment = nativeObservedEffectCommitment({ ...endpoints, nativeGid: facts.nativeGid,
    blockId: facts.observation.blockId, blockHeight: facts.observation.blockHeight,
    transactionSHA256: facts.transactionSHA256, amount: facts.observation.amount });
}
async function fixture(family = '1') {
  const rule = { family, genesis: h('native-genesis-' + family), asset: h('native-asset-' + family), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : '0', maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  const rulePath = { index: '0', siblings: [ZERO, ZERO, ZERO] };
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: h('hub-domain'), registryEpoch: '1',
    rulesRoot: nativeAdmissionRuleRoot(rule, rulePath), keys: attesters.map(value => value.publicKey) };
  const domain = { scope: h('scope'), policy: h('policy'), asset: h('wrapper-asset'), hubDomain: registry.hubDomain,
    registryCommitment: nativeQuorumRegistryCommitment(registry), verifierSetCommitment: h('twelve-role-set'),
    ledgerNamespace: registry.hubDomain };
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? h(name).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '100' : h(name)]));
  Object.assign(config, { poolDomain: await codec.domainCommitment(domain), scope: domain.scope, policy: domain.policy,
    wrapperAssetIdentity: domain.asset, hubDomain: domain.hubDomain, ledgerNamespace: domain.ledgerNamespace,
    registryCommitment: domain.registryCommitment, nativeFamily: family, nativeGenesis: rule.genesis,
    nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset,
      endpoint: family === '1' ? '0014' + h('escrow').slice(0, 40) : h('escrow') }) });
  const noteOpening = { rho: h('rho'), ...owner.publicKey, value: '50000', noteSecret: h('fresh-test-note-secret') };
  const q = balanceCommitment(config.scope, config.policy, { type: 4, rho: noteOpening.rho,
    x: noteOpening.x, y: noteOpening.y, value: noteOpening.value, secret: noteOpening.noteSecret }).toString('hex');
  const claimDomain = claimDomainCommitment(config), secret = claimReceiptSecret({ claimDomain, noteSecret: noteOpening.noteSecret, outputQ: q });
  const observation = { blockId: h('block'), stateCommitment: h('placeholder'), blockHeight: '100', observedAt: '1101',
    finalityKind: family, confirmations: family === '1' ? '6' : '0', sourceCommitment: h('source-endpoint'),
    destinationCommitment: config.escrowEndpointCommitment, amount: noteOpening.value, custodyKind: '1',
    custodyCommitment: h('placeholder'), evidenceFrom: '1101', evidenceUntil: '1401' };
  const facts = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    ruleCommitment: config.nativeRuleCommitment, family, genesis: rule.genesis, asset: rule.asset,
    transactionId: h('transaction') + (family === '2' ? h('signature-tail') : ZERO), effectIndex: '0', nativeGid: h('placeholder'),
    transactionSHA256: h('exact-wire'), wireBindingVersion: '1', wireBindingKind: family,
    wireBindingPosition: family === '1' ? '2' : '1', wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret }),
    observation, nativeContext: family === '1'
      ? { observedTipId: h('tip'), observedTipHeight: '105', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
      : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '120', parentSlot: '119', observedSlot: '130' } };
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  updateObserved(facts);
  const entries = Array(64).fill(ZERO);
  const currentRevocation = { revokedDigest: await codec.revokedDigest(config.poolDomain, config.hubDomain, entries, '0'),
    revokedCount: '0', revocationSequence: '0', entries };
  const raw = { config, domain, registry, rule, rulePath, certificates: [], currentRevocation, noteOpening };
  resign(raw, facts); return raw;
}
async function outbound(family = '1', kind = '1') {
  const raw = await fixture(family), ingress = await buildClaimIngressInputs(raw, { hashFields });
  const claimDomain = claimDomainCommitment(raw.config), facts = structuredClone(raw.certificates[0].facts);
  const destination = { endpoint: facts.observation.sourceCommitment, salt: h('ticket-destination-salt') };
  const ticket = { kind, id: claimTicketId({ claimDomain, kind, nonce: '1' }), claimDomain, amount: '50000',
    destinationCommitment: claimDestinationCommitment({ claimDomain, nativeChainDomain: nativeAdmissionChainDomain(raw.rule),
      endpoint: destination.endpoint, amount: '50000', maxFee: '100', salt: destination.salt }), maxFee: '100',
    referenceIngressN: kind === '2' ? ingress.statement.admissionN : ZERO,
    referenceQ: kind === '2' ? ingress.statement.outputQ : ZERO };
  delete raw.noteOpening;
  Object.assign(raw, { ticket, destination });
  facts.observation.sourceCommitment = raw.config.escrowEndpointCommitment;
  facts.observation.destinationCommitment = destination.endpoint;
  facts.transactionId = h('outbound-transaction') + (family === '2' ? h('outbound-tail') : ZERO);
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  facts.wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: raw.config.ledgerNamespace,
    secret: claimTicketSecret({ claimDomain, ticketId: ticket.id }) });
  updateObserved(facts); resign(raw, facts); return raw;
}
const ingress = raw => buildClaimIngressInputs(raw, { hashFields });
const discharge = raw => buildClaimDischargeInputs(raw, { hashFields });

test('CI51 BTC/SOL keep original note, K/N, 829-byte facts and exact public ABI', async () => {
  for (const family of ['1', '2']) {
    const raw = await fixture(family), job = await ingress(raw), s = job.statement;
    assert.equal(job.publicInputs.length, 51);
    assert.deepEqual(decodeClaimIngressInputs(job.publicInputs), s);
    assert.deepEqual(job.publicInputs, job.expectedPublicInputs);
    assert.equal(raw.certificates[0].frameHex.length, 829 * 2);
    const secret = claimReceiptSecret({ claimDomain: s.claimDomain, noteSecret: raw.noteOpening.noteSecret, outputQ: s.outputQ });
    assert.equal(s.admissionN, nativeAdmissionNullifier({ ledgerNamespace: raw.config.ledgerNamespace,
      secret, nativeGid: raw.certificates[0].facts.nativeGid }));
    assert.equal(s.refundDestination, claimDestinationCommitment({ claimDomain: s.claimDomain,
      nativeChainDomain: nativeAdmissionChainDomain(raw.rule), endpoint: raw.certificates[0].facts.observation.sourceCommitment,
      amount: s.amountQ, maxFee: raw.config.refundMaxFee, salt: claimRefundSalt({ claimDomain: s.claimDomain,
        noteSecret: raw.noteOpening.noteSecret, outputQ: s.outputQ }) }));
    assert.equal(s.ingressReceiptLeaf, await codec.receiptLeaf(raw.config.poolDomain, claimIngressReceiptCommitment({
      claimDomain: s.claimDomain, outputQ: s.outputQ, amount: s.amountQ, admissionN: s.admissionN, refundDestination: s.refundDestination })));
    assert.ok(Object.isFrozen(job.inputs.evidence.attester_signatures[0]));
  }
});

test('CI51 requires three genuine ordered distinct low-S signatures on identical facts', async () => {
  const base = await fixture();
  const mutations = [raw => { raw.certificates.pop(); }, raw => { raw.certificates = [raw.certificates[0]]; },
    raw => { raw.certificates[1] = structuredClone(raw.certificates[0]); },
    raw => { raw.certificates.reverse(); },
    ...[0, 1, 2].map(index => raw => { raw.certificates[index].signature = '0'.repeat(128); }),
    raw => { const signature = raw.certificates[0].signature;
      raw.certificates[0].signature = signature.slice(0, 64) + (ORDER - BigInt('0x' + signature.slice(64))).toString(16).padStart(64, '0'); },
    raw => { raw.certificates[1].facts.observation.amount = '50001'; },
    raw => { raw.certificates[2].digest = h('forged-digest'); }];
  for (const change of mutations) { const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw)); }
});

test('CI51 rejects wrong registered domain/rule/escrow/amount/opening/wire and noncanonical data', async () => {
  const base = await fixture();
  const changes = [raw => { raw.config.nativeGenesis = h('other-genesis'); },
    raw => { raw.config.nativeAsset = h('other-asset'); }, raw => { raw.config.nativeFamily = '3'; },
    raw => { raw.domain.verifierSetCommitment = h('changed-original-set'); },
    raw => { raw.rulePath.siblings[0] = h('wrong-path'); }, raw => { raw.config.escrowEndpointCommitment = h('other-escrow'); },
    raw => { raw.config.ledgerNamespace = h('split-ledger'); }, raw => { raw.noteOpening.value = '50001'; },
    raw => { raw.noteOpening.rho = h('different-note'); }, raw => { raw.noteOpening.noteSecret = h('different-secret'); },
    raw => { raw.noteOpening.noteSecret = ZERO; }, raw => { raw.noteOpening.value = 50000; },
    raw => { raw.config.refundMaxFee = '01'; }, raw => { raw.config.gateway = '0x' + raw.config.gateway; },
    raw => { raw.noteOpening.wallet = {}; }, raw => { raw.currentRevocation.revocationSequence = '0\n'; }];
  for (const change of changes) { const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw)); }
  for (const change of [facts => { facts.wireKeyCommitment = h('wrong-wire-key'); },
    facts => { facts.observation.destinationCommitment = h('wrong-escrow'); },
    facts => { facts.observation.amount = '50001'; }]) {
    const raw = structuredClone(base), facts = structuredClone(raw.certificates[0].facts);
    change(facts); updateObserved(facts); resign(raw, facts); await assert.rejects(ingress(raw));
  }
});

test('complete current revocation vector is checked and original GID cannot be hidden', async () => {
  const base = await fixture();
  for (const change of [raw => { raw.currentRevocation.entries[63] = h('hidden-padding'); },
    raw => { raw.currentRevocation.revokedCount = '65'; }, raw => { raw.currentRevocation.revokedDigest = h('unchecked-digest'); }]) {
    const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw));
  }
  const raw = structuredClone(base);
  raw.currentRevocation.entries[0] = raw.certificates[0].facts.nativeGid;
  raw.currentRevocation.revokedCount = '1';
  raw.currentRevocation.revokedDigest = await codec.revokedDigest(raw.config.poolDomain, raw.config.hubDomain,
    raw.currentRevocation.entries, '1');
  await assert.rejects(ingress(raw), /CLAIM_GID_REVOKED/);
});

test('refreshed original ingress keeps Q/N/refund/leaf stable while publishing exact fresh facts times', async () => {
  const raw = await fixture(), first = await ingress(raw), facts = structuredClone(raw.certificates[0].facts);
  Object.assign(facts.observation, { observedAt: '2101', evidenceFrom: '2101', evidenceUntil: '2401' });
  updateObserved(facts); resign(raw, facts);
  const refreshed = await ingress(raw);
  for (const name of ['outputQ', 'admissionN', 'refundDestination', 'ingressReceiptLeaf'])
    assert.equal(refreshed.statement[name], first.statement[name]);
  assert.equal(refreshed.statement.evidenceFrom, '2101'); assert.equal(refreshed.statement.evidenceUntil, '2401');
});

test('CO42 BTC/SOL binds exact REDEEM/REFUND ticket, original K/N and ABI', async () => {
  for (const family of ['1', '2']) for (const kind of ['1', '2']) {
    const raw = await outbound(family, kind), job = await discharge(raw);
    assert.equal(job.publicInputs.length, 42);
    assert.deepEqual(decodeClaimDischargeInputs(job.publicInputs), job.statement);
    assert.equal(job.statement.ticketCommitment, claimTicketCommitment(raw.ticket));
    assert.equal(job.statement.dischargeN, nativeAdmissionNullifier({ ledgerNamespace: raw.config.ledgerNamespace,
      secret: claimTicketSecret({ claimDomain: raw.ticket.claimDomain, ticketId: raw.ticket.id }),
      nativeGid: raw.certificates[0].facts.nativeGid }));
  }
});

test('CO42 rejects ticket substitution, endpoint/amount/fee-opening changes and wrong escrow source', async () => {
  const base = await outbound();
  const changes = [raw => { raw.ticket.id = h('different-ticket'); }, raw => { raw.ticket.amount = '50001'; },
    raw => { raw.ticket.claimDomain = h('different-domain'); }, raw => { raw.ticket.maxFee = '101'; },
    raw => { raw.ticket.referenceIngressN = h('nonzero-redeem-ref'); },
    raw => { raw.ticket.kind = '2'; }, raw => { raw.destination.endpoint = h('different-recipient'); },
    raw => { raw.destination.salt = h('different-salt'); }, raw => { raw.ticket.cancelled = true; },
    raw => { raw.certificates[0].signature = '0'.repeat(128); }];
  for (const change of changes) { const raw = structuredClone(base); change(raw); await assert.rejects(discharge(raw)); }
  for (const change of [facts => { facts.observation.sourceCommitment = h('wrong-source'); },
    facts => { facts.wireKeyCommitment = h('other-ticket-key'); }]) {
    const raw = structuredClone(base), facts = structuredClone(raw.certificates[0].facts);
    change(facts); updateObserved(facts); resign(raw, facts); await assert.rejects(discharge(raw));
  }
});

test('same ticket with a new observed effect keeps ticket commitment; canonical once-only consumption is external', async () => {
  const raw = await outbound('2'), first = await discharge(raw), facts = structuredClone(raw.certificates[0].facts);
  facts.transactionId = h('second-effect') + h('second-tail');
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  updateObserved(facts); resign(raw, facts); const second = await discharge(raw);
  assert.equal(first.statement.ticketCommitment, second.statement.ticketCommitment);
  assert.notEqual(first.statement.dischargeN, second.statement.dischargeN);
});


test('device-root CI51 public preparation matches original signed facts without accepting a note opening',async()=>{
 const {buildDeviceRootClaimIngressPublicV2}=await import('../../../src/claims/controller/controller-retained-state.mjs');
 const raw=await fixture(),original=await buildClaimIngressInputs(raw,{hashFields});
 const outputQ=original.statement.outputQ,claimDomain=original.statement.claimDomain,
  receiptBinding={secret:claimReceiptSecret({claimDomain,noteSecret:raw.noteOpening.noteSecret,outputQ}),
   refundSalt:claimRefundSalt({claimDomain,noteSecret:raw.noteOpening.noteSecret,outputQ})};
 const {noteOpening,...common}=raw,prepared=await buildDeviceRootClaimIngressPublicV2({...common,outputQ,amountQ:noteOpening.value,receiptBinding},{hashFields});
 assert.deepEqual(prepared.statement,original.statement);assert.deepEqual(prepared.expectedPublicInputs,original.expectedPublicInputs);
 await assert.rejects(buildDeviceRootClaimIngressPublicV2({...common,noteOpening,outputQ,amountQ:noteOpening.value,receiptBinding},{hashFields}));
 await assert.rejects(buildDeviceRootClaimIngressPublicV2({...common,config:{...common.config,nativeGenesis:h('foreign')},outputQ,amountQ:noteOpening.value,receiptBinding},{hashFields}),/NATIVE_DOMAIN/);
});

// Original private replacement guards and PoP only. Controller/native readers
// below are explicitly inert ports: no runtime, credit, proof or wire accepted.
test('HOST device-root original replacement observes SAME source, missing D27 binding stays UNKNOWN and effects stay denied',async()=>{
 const {readFile}=await import('node:fs/promises'),{existsSync}=await import('node:fs');
 // The generated profile retains this exact original controller beside the HOST.
 // Canonical/overlay execution resolves the original source through the same module resolver.
 const generatedController=new URL('./controller.mjs',import.meta.url),controllerSource=existsSync(generatedController)?generatedController:new URL(import.meta.resolve('../../../src/claims/controller/controller.mjs'));
 const text=await readFile(controllerSource,'utf8');
 const start=text.indexOf('/** Private observation facade.');assert.ok(start>0);const body=text.slice(start).replace('export function retainOriginalDeviceRootClaimObservationV3','function retainOriginalDeviceRootClaimObservationV3').replace('export async function reopenOriginalDeviceRootClaimObservationV3','async function reopenOriginalDeviceRootClaimObservationV3');
 const DeviceClaim=await import('@lianum/mobile-protocol/device/native-claim-v1'),R=await import('../../../src/execution/account/preparation/readiness-inputs.mjs'),C=await import('@lianum/components/encoding/commitments'),N=await import('@lianum/engine/notes/private-note-tree'),crypto=await import('node:crypto');
 const maps={controllers:new WeakMap(),deviceRootClaimIntakes:new WeakMap(),deviceRootClaimObservationRestartsV3:new WeakMap()},ports={assert,randomBytes:crypto.randomBytes,createPublicKey:crypto.createPublicKey,verify:crypto.verify,...R,copy:R.cloneInput,freeze:R.frozenInput,...C,...N,DeviceClaim,...maps,performance};
 const {reopen}=Function(...Object.keys(ports),body+'\nreturn {reopen:reopenOriginalDeviceRootClaimObservationV3};')(...Object.values(ports));
 const signer=fixtureSigner(9),descriptor=DeviceClaim.normalizeDeviceRootClaimDescriptorV2({profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2,claim:{version:1,profile:DeviceClaim.NATIVE_CLAIM_DEVICE_PAIRING_V1,origin:'https://127.0.0.1:2443',pairingId:h('root-pair'),devicePublicKey:'04'+signer.publicKey.x+signer.publicKey.y,accountScopeSHA256:h('scope'),lifetimeSHA256:h('lifetime'),claimDomain:h('domain'),nativeFamily:'1',nativeGenesis:h('genesis'),nativeAsset:h('native'),wrapperAssetIdentity:h('wrapper'),nativeSymbol:'BTC',claimSymbol:'cBTC',decimals:8,atomicUnit:'satoshi',nativeAssetKind:null,mint:null},pool:'11'.repeat(20),scope:'12'.repeat(32),policy:'13'.repeat(32),recipient:'14'.repeat(20),noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM'});
 const old=Object.freeze({}),originalRuntime=Object.freeze({}),originalClaims=Object.freeze({}),originalKeeper=Object.freeze({}),originalReplacement=Object.freeze({async reconcile(){reconciles++;}});let reconciles=0,reads=0,financialPorts=0;
 const source={profile:descriptor.profile,descriptor,ownerIdentitySHA256:h('owner'),phase:'BORN',intentId:null,admissions:[]},data={apiDeviceRootClaims:[structuredClone(source)],deposits:[],tickets:[]},journal={async read(){return structuredClone(data);},async update(){financialPorts++;throw Error('HOST_NO_WRITE_PORT');},requiresReconciliation:()=>false};
 const ctx={input:{runtime:originalRuntime,claims:originalClaims,keeper:originalKeeper},live(){},journal,serial:async f=>f(),controller:{async reconcile(){reconciles++;}},readers:[{async read(){reads++;return{head:{number:'0',hash:h('head'),timestamp:'0'},ledger:{commitments:[],nullifiers:[]}};},async assertCurrent(){}}]};
 // These identities model the original producer's private map memberships;
 // they confer no owned runtime/claim/controller brand outside this HOST.
 maps.controllers.set(old,{replacement:originalReplacement});maps.controllers.set(originalReplacement,ctx);
 const token=Object.freeze({}),seed={controller:old,runtime:originalRuntime,claims:originalClaims,keeper:originalKeeper,descriptor,source:structuredClone(source),i:0,asset:{assetId:h('asset')},ownerIdentitySHA256:source.ownerIdentitySHA256,used:false};maps.deviceRootClaimObservationRestartsV3.set(token,seed);
 await assert.rejects(reopen({...token},originalReplacement),/ORIGINAL_RESTART_REQUIRED/);
 ctx.input={...ctx.input,runtime:Object.freeze({})};await assert.rejects(reopen(token,originalReplacement),/ORIGINAL_RESTART_SOURCE/);assert.equal(seed.used,false);ctx.input.runtime=originalRuntime;
 const api=await reopen(token,originalReplacement);assert.equal(seed.used,true);await assert.rejects(reopen(token,originalReplacement),/ORIGINAL_RESTART_REQUIRED/);
 assert.throws(()=>api.quoteW39(),/REOPENED_OBSERVE_ONLY/);assert.throws(()=>api.reviewD27(),/REOPENED_OBSERVE_ONLY/);assert.throws(()=>api.effectChallenge(),/REOPENED_OBSERVE_ONLY/);
 const permission=api.challenge('READ'),signature=signer.sign(DeviceClaim.deviceRootClaimPermissionMessageV2(permission)),view=await api.read({permission,signature});assert.equal(view.note.state,'UNKNOWN');assert.equal(view.availablePrivateClaims,null);assert.equal(view.commitment,null);assert.equal(view.nullifier,null);assert.equal(reconciles,1);assert.equal(reads,1);assert.equal(financialPorts,0);
 await assert.rejects(api.read({permission,signature}),/ORIGINAL_PERMISSION/);const changed=api.challenge('READ');data.apiDeviceRootClaims[0].ownerIdentitySHA256=h('foreign-owner');await assert.rejects(api.read({permission:changed,signature:signer.sign(DeviceClaim.deviceRootClaimPermissionMessageV2(changed))}),/RETAINED_OBSERVATION_CHANGED/);assert.equal(financialPorts,0);await api.close();assert.throws(()=>api.challenge('READ'),/INTAKE_CLOSED/);
});

// Actual completion helper, with explicit inert native/controller ports.
// No block, finality, wire, proof or economic result is accepted by this HOST.
test('HOST device-root BTC original payout confirms SAME once-sent wire then completes CO42 without another transfer',async()=>{
 const {readFile}=await import('node:fs/promises'),{existsSync}=await import('node:fs'),generated=new URL('../api/native-claim-http.mjs',import.meta.url);
 const text=await readFile(existsSync(generated)?generated:new URL(import.meta.resolve('../../../src/api/claims/native-claim-http.mjs')),'utf8'),start=text.indexOf('async function finishOriginalDeviceRootBtcPayoutV3('),end=text.indexOf('export async function startOriginalDeviceRootClaimTlsV2(',start);assert.ok(start>0&&end>start);
 const complete=Function('assert',text.slice(start,end)+'\nreturn finishOriginalDeviceRootBtcPayoutV3;')(assert),ticketId=h('same-ticket'),receipt={family:'1',nativeId:h('same-native-wire-id'),transactionSHA256:h('same-native-wire'),broadcastAttempts:1},calls=[];let count=0;
 const original={descriptor:{claim:{nativeFamily:'1'}},poolIndex:0,claims:{nativeRuntimes:[{async confirm(id){assert.equal(id,receipt.nativeId);calls.push('confirm');}}]},controller:{async privateNativeReceipt(request){assert.deepEqual(request,{operationId:ticketId});calls.push('receipt');return structuredClone(receipt);},async payout(request){assert.deepEqual(request,{ticketId});count++;calls.push('complete');return{status:'DISCHARGED'};}}};
 assert.deepEqual(await complete(original,ticketId,{status:'UNKNOWN'}),{status:'DISCHARGED'});assert.deepEqual(calls,['receipt','confirm','receipt','complete']);assert.equal(count,1);
 calls.length=0;assert.deepEqual(await complete(original,ticketId,{status:'DISCHARGED'}),{status:'DISCHARGED'});assert.deepEqual(calls,[]);
 receipt.broadcastAttempts=2;await assert.rejects(complete(original,ticketId,{status:'UNKNOWN'}),/ORIGINAL_SEND_REQUIRED/);assert.deepEqual(calls,['receipt']);receipt.broadcastAttempts=1;calls.length=0;
 original.controller.privateNativeReceipt=async request=>{assert.deepEqual(request,{operationId:ticketId});calls.push('receipt');return{...receipt,transactionSHA256:calls.length>1?h('changed-wire'):receipt.transactionSHA256};};await assert.rejects(complete(original,ticketId,{status:'UNKNOWN'}),/PAYOUT_WIRE_CHANGED/);assert.deepEqual(calls,['receipt','confirm','receipt']);assert.equal(count,1);
 original.descriptor.claim.nativeFamily='2';calls.length=0;assert.deepEqual(await complete(original,ticketId,{status:'UNKNOWN'}),{status:'UNKNOWN'});assert.deepEqual(calls,[]);
});


test('HOST RootNote original CI51 selects recent-blockhash ingress before birth while payouts retain nonce authority',async()=>{
 // Execute only the original selector, constructor guards, route selector and
 // bootstrap profile guard. The factory port is explicitly inert; this test
 // starts no chain, key, funding, proof, wire, or owned runtime capability.
 const {readFile}=await import('node:fs/promises'),{existsSync}=await import('node:fs');
 const original=(generated,canonical)=>{const candidate=new URL(generated,import.meta.url);return existsSync(candidate)?candidate:new URL(canonical,import.meta.url);};
 const runtimeText=await readFile(original('../chain-adapters/owned-solana-runtime.mjs','../../../src/chains/solana/runtime/owned-solana-runtime.mjs'),'utf8');
 const apiText=await readFile(original('../api/native-claim-http.mjs','../../../src/api/claims/native-claim-http.mjs'),'utf8');
 const bootstrapText=await readFile(original('../ops/deploy-native-claims.mjs','../../../src/operations/deployments/claims/deploy-native-claims.mjs'),'utf8');
 const requireCondition=(condition,code)=>assert.ok(condition,code),options=Object.freeze({profile:'HOST_INERT_ORIGINAL_OPTIONS'}),births=[];
 const start=runtimeText.indexOf('export async function createOwnedCombinedSolanaRecentBlockhashClaimRuntimeV1()'),end=runtimeText.indexOf('const ownedJupiterPublicBanksV1=',start);assert.ok(start>0&&end>start);
 const guardStart=runtimeText.indexOf("  requireCondition(typeof originalClaimIngress === 'boolean'"),guardEnd=runtimeText.indexOf('  const splMaterial=',guardStart);assert.ok(guardStart>0&&guardEnd>guardStart);
 const routeStart=runtimeText.indexOf('    const usesNonce = selectedRoute =>'),routeEnd=runtimeText.indexOf('    function selectedNonce(',routeStart);assert.ok(routeStart>0&&routeEnd>routeStart);
 const selectedProfile=Function('requireCondition','cohort','custody','combined','recovery','jupiterPublic','jupiterSpl','originalClaimIngress',runtimeText.slice(guardStart,guardEnd)+runtimeText.slice(routeStart,routeEnd)+'return usesNonce;');
 const createOwnedSolanaRuntimeProfile=async(progress,actualOptions,cohort,custody=false,combined=false,recovery=null,jupiterPublic=false,jupiterSpl=false,originalClaimIngress=false)=>{
  assert.equal(actualOptions,options);assert.equal(typeof progress,'function');
  const usesNonce=selectedProfile(requireCondition,cohort,custody,combined,recovery,jupiterPublic,jupiterSpl,originalClaimIngress);
  births.push({cohort,custody,combined,recovery,jupiterPublic,jupiterSpl,originalClaimIngress});return{usesNonce};
 };
 const create=Function('requireCondition','createOwnedSolanaRuntimeProfile','SOLANA_PRIVATE_COHORT_OPTIONS',runtimeText.slice(start,end).replace('export async function','async function')+'return createOwnedCombinedSolanaRecentBlockhashClaimRuntimeV1;')(requireCondition,createOwnedSolanaRuntimeProfile,options);
 await assert.rejects(create({}),/FIXED_CONSTRUCTOR/);assert.equal(births.length,0);
 const fresh=await create();assert.deepEqual(births,[{cohort:true,custody:true,combined:true,recovery:null,jupiterPublic:false,jupiterSpl:false,originalClaimIngress:true}]);
 assert.equal(fresh.usesNonce({name:'deposit'}),false);for(const name of ['refund','redeem'])assert.equal(fresh.usesNonce({name}),true);assert.equal(fresh.usesNonce({name:null}),false);
 const current=await createOwnedSolanaRuntimeProfile(async()=>{},options,true,true,true);assert.equal(current.usesNonce({name:'deposit'}),true);assert.equal(current.usesNonce({name:'redeem'}),true);
 assert.throws(()=>selectedProfile(requireCondition,true,true,false,null,false,false,true),/FIXED_PROFILE/);assert.throws(()=>selectedProfile(requireCondition,true,true,true,{},false,false,true),/FIXED_PROFILE/);assert.throws(()=>selectedProfile(requireCondition,true,true,true,null,false,true,true),/FIXED_PROFILE/);
 // Execute the exact factory selection used by the real RootNote product.
 const factoryText=apiText.slice(apiText.indexOf('async function createDeviceRootClaimLocalOperator(config,profile){'));
 const expression=/else\(\{custody:solana\}=await([^;]+)\);live\(\);/.exec(factoryText);assert.ok(expression);
 const selected=Function('profile','createOwnedCombinedSolanaRecentBlockhashClaimRuntimeV1','createOwnedCombinedSolanaRuntime','return '+expression[1]+';');let legacyCalls=0;
 const legacy=async()=>{legacyCalls++;return{};};for(const profile of ['BTC_EXIT_V3','SOL_EXIT_V3'])await selected(profile,create,legacy);assert.equal(legacyCalls,0);for(const profile of ['BTC','SOL'])await selected(profile,create,legacy);assert.equal(legacyCalls,2);
 assert.match(factoryText,/family==='SPL'\)\{const \{createOwnedCombinedSolanaSplRuntimeV1\}/);
 // Keep the original bootstrap refusal for every nonce ingress unchanged.
 const bStart=bootstrapText.indexOf('  if (ingressV3&&!spl)'),bEnd=bootstrapText.indexOf('  assert.ok(!nativeRuntimes.every',bStart);
 const endGuard=bEnd<0?bootstrapText.indexOf('  assert.ok(nativeRuntimes.every',bStart):bEnd;assert.ok(bStart>0&&endGuard>bStart);
 const C=await import('@lianum/components/encoding/commitments'),R=await import('../../../src/execution/account/preparation/readiness-inputs.mjs');
 const bootstrapGuard=Function('assert','exactRecord','SOLANA_NONCE_INGRESS_PROFILE','NATIVE_INGRESS_V3_PROFILE','nativeRuntimes','ingressV3','spl',bootstrapText.slice(bStart,endGuard));
 const propertyStart=runtimeText.indexOf('...(custody ? { roles, inventory, syntheticPrefunding,'),propertyEnd=runtimeText.indexOf(' : {',runtimeText.indexOf('payoutFinalSendProfile: SOLANA_PAYOUT_FINAL_SEND_PROFILE',propertyStart));assert.ok(propertyStart>0&&propertyEnd>propertyStart);
 const objectBody=runtimeText.slice(propertyStart+'...(custody ? '.length,propertyEnd);
 const pins=R.frozenInput({depositor:{authorityPublicKey:h('depositor')},escrow:{authorityPublicKey:h('escrow')}}),surface=Function('roles','inventory','syntheticPrefunding','originalClaimIngress','nonceInfrastructureByAuthority','SOLANA_NONCE_INGRESS_PROFILE','SOLANA_PAYOUT_FINAL_SEND_PROFILE','frozenInput','return '+objectBody+';');
 const originalSurface=surface({},()=>{},null,true,pins,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3','OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2',R.frozenInput),v3Surface=surface({},()=>{},null,false,pins,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3','OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2',R.frozenInput);
 assert.equal(originalSurface.originalClaimIngressProfile,'OWNED_SOLANA_ORIGINAL_RECENT_BLOCKHASH_CLAIM_V1');assert.equal(originalSurface.payoutFinalSendProfile,v3Surface.payoutFinalSendProfile);assert.deepEqual(Object.keys(originalSurface.payoutNonceInfrastructureByAuthority),['escrow']);
 assert.equal(Object.hasOwn(originalSurface,'nonceIngressProfile'),false);assert.equal(Object.hasOwn(originalSurface,'nonceInfrastructureByAuthority'),false);
 bootstrapGuard(assert,C.exactRecord,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3','LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',[{},originalSurface],false,false);
 assert.throws(()=>bootstrapGuard(assert,C.exactRecord,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3','LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',[{},v3Surface],false,false),/V3_RUNTIME_REQUIRES_NEW_BOOTSTRAP/);
 bootstrapGuard(assert,C.exactRecord,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3','LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',[{},v3Surface],true,false);
});


test('HOST RootNote new bare CI51 V1 bootstrap selects reviewed preparation before native birth without SPL or historical fallback',async()=>{
 // Actual candidate loader/finite entries/consumer selector; imports return
 // explicitly inert DATA. No native capability, compiler, proof or funds.
 const {readFile}=await import('node:fs/promises'),{existsSync}=await import('node:fs');
 const original=(generated,canonical)=>{const value=new URL(generated,import.meta.url);return existsSync(value)?value:new URL(canonical,import.meta.url);};
 const deployment=await readFile(original('../ops/deploy-native-claims.mjs','../../../src/operations/deployments/claims/deploy-native-claims.mjs'),'utf8');
 const api=await readFile(original('../api/native-claim-http.mjs','../../../src/api/claims/native-claim-http.mjs'),'utf8');
 const begin=deployment.indexOf('async function loadBootstrapArtifacts('),end=deployment.indexOf('export async function preflightNativeSplClaimIngressV1Artifacts()',begin);assert.ok(begin>0&&end>begin);
 const bare=Object.freeze({contracts:Object.freeze({artifacts:Object.freeze({gateway:'HOST_ORIGINAL_GATEWAY',token:'HOST_ORIGINAL_CLAIM_TOKEN'})}),verifiers:Object.freeze({CI51:'HOST_NEW_ORIGINAL_CI51_V1',CO42:'HOST_NEW_ORIGINAL_CO42'})}),base=Object.freeze({ledger:'HOST_ORIGINAL_LEDGER'}),calls=[];
 const fixedImport=async path=>{calls.push(path);if(path==='./native-spl-claim-v1-artifacts.mjs')return{async loadNativeSplClaimV1Artifacts(){return bare;}};if(path==='./native-claim-ingress-v3-artifacts.mjs')return{async loadNativeClaimIngressV3Artifacts(){return{profile:'HOST_ORIGINAL_V3'};}};if(path==='./native-claim-artifacts.mjs')return{async loadNativeClaimArtifacts(){throw Error('HOST_HISTORICAL_MANIFEST_ABSENT');}};throw Error('HOST_UNKNOWN_IMPORT');};
 let splExtensions=0;const load=Function('assert','fixedImport','loadFlatDeploymentArtifacts','loadNativeSplClaimTokenArtifactsV1','loadNativeSplClaimValidationArtifactsV1',deployment.slice(begin,end).replaceAll('import(', 'fixedImport(')+'return loadBootstrapArtifacts;')(assert,fixedImport,async()=>base,()=>{splExtensions++;return{artifacts:{nativeSplToken:'HOST_SPL_TOKEN'}};},()=>{splExtensions++;return{artifacts:{nativeSplClaimValidation:'HOST_SPL_VALIDATION'}};});
 const loaded=await load(false,false,true);assert.equal(loaded.bundle,bare);assert.equal(loaded.baseBundle,base);assert.deepEqual(calls,['./native-spl-claim-v1-artifacts.mjs']);assert.equal(splExtensions,0);assert.equal(Object.hasOwn(loaded.bundle.contracts.artifacts,'nativeSplToken'),false);
 await assert.rejects(load(false,false,false),/HOST_HISTORICAL_MANIFEST_ABSENT/);assert.equal(calls.filter(p=>p==='./native-spl-claim-v1-artifacts.mjs').length,1);assert.equal(splExtensions,0);
 await assert.rejects(load(true,false,true),/FIXED_BOOTSTRAP/);await assert.rejects(load(false,true,true),/FIXED_BOOTSTRAP/);await assert.rejects(load(false,false,{}),/FIXED_BOOTSTRAP/);
 const oldV3=await load(true,false,false);assert.equal(oldV3.bundle.profile,'HOST_ORIGINAL_V3');const oldSpl=await load(false,true,false);assert.equal(oldSpl.bundle.contracts.artifacts.nativeSplToken,'HOST_SPL_TOKEN');assert.equal(splExtensions,2);
 const ctorBegin=deployment.indexOf('export async function preflightOriginalRecentBlockhashNativeClaimV4Artifacts()'),ctorEnd=deployment.indexOf('export async function createNativeClaimIngressV3Bootstrap(input)',ctorBegin);assert.ok(ctorBegin>0&&ctorEnd>ctorBegin);
 let nativeBirths=0;const entries=Function('assert','loadBootstrapArtifacts','createBootstrap',deployment.slice(ctorBegin,ctorEnd).replaceAll('export async function','async function')+'return {preflight:preflightOriginalRecentBlockhashNativeClaimV4Artifacts,create:createOriginalRecentBlockhashNativeClaimBootstrapV4};')(assert,load,async(input,...profile)=>{nativeBirths++;assert.deepEqual(profile,[false,false,true]);return input;});
 await assert.rejects(entries.preflight({}),/NO_OPTIONS/);assert.equal(nativeBirths,0);await entries.preflight();assert.equal(nativeBirths,0);await assert.rejects(entries.create({},{}),/ARITY/);assert.equal(nativeBirths,0);const originalInput=Object.freeze({profile:'HOST_INERT_ORIGINAL_INPUT'});assert.equal(await entries.create(originalInput),originalInput);assert.equal(nativeBirths,1);
 const body=api.slice(api.indexOf('async function createDeviceRootClaimLocalOperator(config,profile){')),match=/const bootstrap=await\(([^\n]+)\)\(\{runtime,nativeRuntimes/.exec(body);assert.ok(match);
 const select=Function('family','profile','createNativeSplClaimIngressV1Bootstrap','createOriginalRecentBlockhashNativeClaimBootstrapV4','createNativeClaimBootstrap','return '+match[1]+';'),spl=Object.freeze({}),fresh=Object.freeze({}),legacy=Object.freeze({});
 for(const family of ['BTC','SOL'])assert.equal(select(family,family+'_EXIT_V3',spl,fresh,legacy),fresh);for(const family of ['BTC','SOL'])assert.equal(select(family,family,spl,fresh,legacy),legacy);assert.equal(select('SPL','SPL_EXIT_V3',spl,fresh,legacy),spl);
 const preflight=body.indexOf('await preflightOriginalRecentBlockhashNativeClaimV4Artifacts()'),birth=body.indexOf('runtime=await(');assert.ok(preflight>0&&preflight<birth);assert.match(body.slice(0,preflight),/profile\.endsWith\('_EXIT_V3'\)&&family!=='SPL'/);
});


// Actual original producer bodies + real encrypted journal/CAS. Native market,
// observer and provider ports are explicitly inert and establish no economics.
test('HOST RootNote prospective SPL SOURCE binds only original provider before FUND and preserves UNKNOWN without replay',async()=>{
 const {readFile,mkdtemp,mkdir,rm}=await import('node:fs/promises'),{existsSync}=await import('node:fs'),{join}=await import('node:path'),{tmpdir}=await import('node:os');
 const {createClaimVaultSession}=await import('../../../src/claims/storage/vault-session.mjs');
 const original=(generated,canonical)=>{const value=new URL(generated,import.meta.url);return existsSync(value)?value:new URL(canonical,import.meta.url);};
 const source=await readFile(original('./controller.mjs','../../../src/claims/controller/controller.mjs'),'utf8'),runtimeSource=await readFile(original('../chains/owned-solana-runtime.mjs','../../../src/chains/solana/runtime/owned-solana-runtime.mjs'),'utf8'),http=await readFile(original('../api/native-claim-http.mjs','../../../src/api/claims/native-claim-http.mjs'),'utf8');
 const a=source.indexOf('export async function createOriginalDeviceRootSplSourceBindingV3('),b=source.indexOf('/** Original references for the fixed TLS/common-state consumer.',a);assert.ok(a>0&&b>a);
 const maps={deviceRootClaimIntakes:new WeakMap()},providers=new WeakMap(),pairs=new WeakMap();let captures=0,wraps=0,quotes=0;
 const ports={assert,...maps,readOwnedSolanaSplOriginalGraphV3:n=>{assert.ok(pairs.has(n),'HOST_ORIGINAL_NATIVE_REQUIRED');return pairs.get(n);},assertOwnedSolanaSplGraphPairV1:(n,g)=>assert.equal(pairs.get(n),g,'HOST_FOREIGN_GRAPH'),assertOwnedFlatNativeProvider:(p,expected)=>{const actual=providers.get(p);assert.ok(actual,'HOST_ORIGINAL_PROVIDER_REQUIRED');for(const[k,v]of Object.entries(expected))assert.equal(actual[k],v,'HOST_FOREIGN_PROVIDER');},captureOwnedFlatSolanaSourceForSplV1:async p=>{captures++;const x=providers.get(p);assert.ok(x?.observed,'HOST_OBSERVED_SOURCE_REQUIRED');assert.equal((await x.journal.read()).apiDeviceRootClaims[0].splSource.phase,'BINDING');return x.token;}};
 const create=Function(...Object.keys(ports),source.slice(a,b).replace('export async function','async function')+'return createOriginalDeviceRootSplSourceBindingV3;')(...Object.values(ports));
 const directory=await mkdtemp(join(tmpdir(),'root-note-spl-source-host-'));await mkdir(join(directory,'journals'),{mode:0o700});const vaults=[],producers=[];let ordinal=0;
 async function fixture({observed=false,wrapFailure=false,late=false}={}){
  const descriptor=Object.freeze({claim:Object.freeze({claimDomain:'HOST_DISTINCT_SPL_DOMAIN'}),profile:'HOST_INERT_DEVICE_ROOT_DESCRIPTOR'}),runtime=Object.freeze({}),graph=Object.freeze({}),flatSystem=Object.freeze({}),claims=Object.freeze({flatSystem}),ownerIdentitySHA256='HOST_ORIGINAL_OWNER';
  let live=true,stopped=false,busy=false,binding=null,readers=0;
  const native={transfers:[],async bindOriginalSourceV1(token){wraps++;assert.equal(token,providerState.token);assert.equal((await journal.read()).apiDeviceRootClaims[0].splSource.phase,'BINDING');if(wrapFailure)throw Error('HOST_LOST_WRAP_REPLY');},async quoteOriginalDepositAmountV1(){quotes++;assert.equal(wrapFailure,false);return'123';}};pairs.set(native,graph);
  const vault=createClaimVaultSession({path:join(directory,'journals','journal-'+ordinal++),password:'HOST original encrypted SOURCE binding journal'});vaults.push(vault);let record=await vault.create({deposits:[],tickets:[],evm:[],apiDeviceRootClaims:[{descriptor,ownerIdentitySHA256,phase:'BORN',admissions:[]} ]});
  const journal={async read(){const actual=await vault.read();assert.deepEqual(actual,record);return structuredClone(actual.data);},async update(transform){const next=await vault.update(record.revision,transform);const actual=await vault.read();assert.deepEqual(actual,next);record=next;return structuredClone(next.data);}};
  const serial=async(work)=>{assert.ok(live);assert.equal(busy,false);busy=true;try{return await work();}finally{busy=false;}},original={serial,alive:()=>assert.ok(live),journal,descriptor,ownerIdentitySHA256,originalNative:()=>native,install:v=>{assert.equal(binding,null);assert.equal(late,false,'HOST_BEFORE_FUND_REQUIRED');binding=v;},beforeTarget:()=>assert.equal(stopped,false,'HOST_BEFORE_D27_REQUIRED'),empty:async()=>{readers++;assert.equal(late,false,'HOST_EMPTY_TARGET_REQUIRED');}};
  const intake=Object.freeze({}),provider=Object.freeze({}),providerState={runtime,system:flatSystem,poolIndex:0,nativeRuntime:graph,family:'2',recipientIndex:1,observed,token:Object.freeze({}),journal};providers.set(provider,providerState);maps.deviceRootClaimIntakes.set(intake,{...original,splSourceOriginal:original,runtime,claims});
  return{intake,provider,providerState,journal,get record(){return record;},get binding(){return binding;},native,graph,set stopped(v){stopped=v;},invalidate(){live=false;},async birth(){const p=await create(intake,provider);producers.push(p);return p;}};
 }
 try{
  const f=await fixture({observed:true});await assert.rejects(create({...f.intake},f.provider),/ORIGINAL_INTAKE/);await assert.rejects(create(f.intake,{}),/ORIGINAL_PROVIDER/);
  const foreign=await fixture({observed:true});await assert.rejects(create(f.intake,foreign.provider),/FOREIGN_PROVIDER/);assert.equal(captures,0);assert.equal(wraps,0);
  const p=await f.birth(),initial=await p.status();assert.equal(initial.phase,'BORN');assert.equal(initial.amount,null);assert.equal(initial.privateCreditEstablished,false);assert.equal(initial.availablePrivateClaims,null);assert.equal(captures,0);assert.equal(wraps,0);
  await assert.rejects(create(f.intake,f.provider),/SOURCE_ONCE/);await assert.rejects(create(f.intake,f.provider,{}),/ARITY/);assert.throws(()=>p.bindObservedOriginalOnce({}),/ARITY/);assert.equal(captures,0);
  const ready=await p.bindObservedOriginalOnce();assert.equal(ready.amount,'123');assert.equal(ready.privateCreditEstablished,false);assert.equal(f.binding.phase,'READY');assert.equal((await f.journal.read()).apiDeviceRootClaims[0].splSource.amount,'123');assert.equal(captures,1);assert.equal(wraps,1);assert.equal(quotes,1);
  assert.throws(()=>p.bindObservedOriginalOnce(),/ALREADY_ADMITTED/);assert.equal(captures,1);assert.equal(wraps,1);assert.equal((await p.status()).availablePrivateClaims,null);
  const u=await fixture();const unknown=await u.birth();await assert.rejects(unknown.bindObservedOriginalOnce(),/OBSERVED_SOURCE_REQUIRED/);assert.equal((await unknown.status()).phase,'UNKNOWN');assert.equal((await u.journal.read()).apiDeviceRootClaims[0].splSource.amount,null);assert.throws(()=>unknown.bindObservedOriginalOnce(),/ALREADY_ADMITTED/);assert.equal(wraps,1);
  const lost=await fixture({observed:true,wrapFailure:true});const lp=await lost.birth();await assert.rejects(lp.bindObservedOriginalOnce(),/LOST_WRAP_REPLY/);assert.equal((await lp.status()).phase,'UNKNOWN');assert.equal((await lost.journal.read()).apiDeviceRootClaims[0].splSource.amount,null);assert.throws(()=>lp.bindObservedOriginalOnce(),/ALREADY_ADMITTED/);assert.equal(wraps,2);assert.equal(quotes,1);
  const late=await fixture({late:true});await assert.rejects(late.birth(),/EMPTY_TARGET/);assert.equal(late.binding,null);
  await p.close();assert.throws(()=>p.status(),/SOURCE_CLOSED/);assert.equal(f.record.revision,3);const ciphertext=await readFile(join(directory,'journals','journal-0'),'utf8');assert.equal(ciphertext.includes('HOST_DISTINCT_SPL_DOMAIN'),false);assert.equal(ciphertext.includes('ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING'),false);
  // Preserve the original pair getter's WeakMap identity/no caller options.
  const ra=runtimeSource.indexOf('export function readOwnedSolanaSplOriginalGraphV3('),rb=runtimeSource.indexOf('export function assertOwnedSolanaSplClaimCohortV1(',ra);assert.ok(ra>0&&rb>ra);
  const grouped=new WeakMap([[f.native,{graph:f.graph}]]),get=Function('requireCondition','assertOwnedSolanaSplCustodyV1','originalSplFacadesV1','assertOwnedSolanaSplGraphPairV1',runtimeSource.slice(ra,rb).replace('export function','function')+'return readOwnedSolanaSplOriginalGraphV3;')((v,c)=>assert.ok(v,c),n=>assert.ok(grouped.has(n)),grouped,(n,g)=>assert.equal(grouped.get(n).graph,g));
  assert.equal(get(f.native),f.graph);assert.throws(()=>get({...f.native}));assert.throws(()=>get(f.native,f.graph),/ARITY/);
  const selector=http.slice(http.indexOf('async function createDeviceRootClaimLocalOperator(config,profile){'));assert.match(selector,/sourceSpl=profile==='SPL_SOURCE_EXIT_V4'/);assert.match(selector,/family=sourceSpl\?'SPL'/);
  assert.ok(selector.indexOf('createOriginalDeviceRootSplSourceBindingV3(intake,sourceProvider)')<selector.indexOf('startOriginalDeviceRootClaimTlsV2('));assert.match(selector,/live:\(\)=>\{live\(\);if\(restarted\|\|restartWork\)deviceHttpFail\(\);\}/);
 }finally{for(const p of producers)await p.close().catch(()=>{});for(const v of vaults)v.close();await rm(directory,{recursive:true,force:true});}
});


test('HOST SPL SOURCE financial policy keeps target four receipts separate and rejects mixed domains or duplicate original receipts',async()=>{
 const {readFile}=await import('node:fs/promises'),{existsSync}=await import('node:fs'),{fileURLToPath}=await import('node:url'),{join,dirname}=await import('node:path');
 let root=fileURLToPath(new URL('../../../../../',import.meta.url));
 const marker='/canonical-overlay/';if(root.includes(marker))root=root.slice(0,root.indexOf(marker)+marker.length-1);
 for(let i=0;i<8&&!existsSync(join(root,'scripts/validation/device-root-native-claim-v3/policy.mjs'));i++)root=dirname(root);assert.ok(existsSync(join(root,'scripts/validation/device-root-native-claim-v3/policy.mjs')),'HOST_ORIGINAL_DRIVER_FILE_REQUIRED');
 const raw=await readFile(join(root,'scripts/validation/device-root-native-claim-v3/policy.mjs'),'utf8'),body=raw.replace(/^import assert[^\n]+\n/m,'').replaceAll('export ','');
 const p=Function('assert',body+'return{assertRelease,assertSplSourceRelease,assertSplSourceResult,SPL_SOURCE_RELATIONS,SPL_SOURCE_PROFILE,SPL_SOURCE_RESULT};')(assert);
 p.assertRelease();p.assertSplSourceRelease();assert.throws(()=>p.assertSplSourceRelease({}),/ERR_ASSERTION/);
 const unreviewed=body.replace(/const SPL_SOURCE_REVIEWED_RELEASE=[^\n]+;/,'const SPL_SOURCE_REVIEWED_RELEASE=null;');assert.notEqual(unreviewed,body);
 const assertUnreviewedRelease=Function('assert',unreviewed+'return assertSplSourceRelease;')(assert);assert.throws(()=>assertUnreviewedRelease(),/DEVICE_ROOT_SPL_SOURCE_RELEASE_REQUIRED/);
 const h=n=>n.toString(16).padStart(64,'0'),id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
 const proof=(relation,n)=>({relation,proofSHA256:h(n),publicInputsSHA256:h(n+100),manifestSHA256:h(n+200),resultSHA256:h(n+300),resourcesSHA256:h(n+400),evidence:{runId:id(n),jobId:id(n+100),relation,sourceVersion:h(901),keySHA256:h(902),selfVerified:true,resourceReceiptCompleted:true,manifestSHA256:h(n+200),resultSHA256:h(n+300),resourcesSHA256:h(n+400)}});
 const note={commitment:h(701),nullifier:h(702)},before={state:'LIVE',available:'321',path:{leaf:note.commitment}},after={state:'SPENT',available:null,path:{leaf:note.commitment}};
 const target=['deposit_intent','native_claim_ingress','withdraw_balance','native_claim_discharge'].map((r,i)=>proof(r,i+21));target[2].evidence={id:id(23),mode:'withdraw_balance',acceptedResult:true,exit:{code:0,signal:null},worker:{verified:true,publicInputCount:39},resourceReceiptCompleted:true};
 const source=p.SPL_SOURCE_RELATIONS.map((r,i)=>({...proof(r,i+1),...(['deposit_intent','native_claim_ingress'].includes(r)?{claimDomain:h(801)}:{graphDomainCommitment:h(802)})}));
 const v={profile:p.SPL_SOURCE_PROFILE,format:p.SPL_SOURCE_RESULT,phase:'completed',success:true,interrupted:false,sourceUnchanged:true,localOnly:true,fakeFundsOnly:true,originalDeviceRootSplSourceNoteExitEstablished:true,originalBtcToSolSourceGraphEstablished:true,originalDeviceRootObservationRestartEstablished:true,originalDeviceRootCommonStateEstablished:true,noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM',amountAtomic:'321',nativeClaimBinding:{nativeFamily:'2',decimals:6,nativeAssetKind:'SOLANA_SPL_USDC',mint:'A'.repeat(32),nativeGenesis:h(810),nativeAsset:h(811),claimDomain:h(803)},proofs:target,sourceProofs:source,note:{...note,before,after},withdrawal:{stage:'CONFIRMED',statement:note,proofSHA256:target[2].proofSHA256},redemption:{status:'DISCHARGED',requestId:'original',ticketId:'ticket'},redemptionBeforeRestart:{requestId:'original',ticketId:'ticket'},restart:{observationOnly:true,sameOriginalRuntime:true,keeperChildRestarted:true,sameDescriptor:true},loss:{actions:['WITHDRAW_W39','PAYOUT_NATIVE'],sdkBothReportedUnknown:true,withdrawPosts:1,payoutPosts:1,proofCountBeforeRestart:4,proofCountAfterRestart:4,effectsAfterRestart:0,totalProofCountBeforeRestart:16,totalProofCountAfterRestart:16,sourceFinancialEffectsAfterRestart:0},mobile:{nodeAesGcm:true,nodeCryptographicEntropy:true,ciphertextPersisted:true,rootPersistedToFile:false,secureStoreHardware:false,biometricHardware:false,physicalPhoneEstablished:false},economic:{sameBirthIdentity:true,sameAsset:true,availableAfter:'0',requestsConfirmed:true},originalSource:{profile:'ORIGINAL_DEVICE_ROOT_SPL_SOURCE_EXECUTION_V4',phase:'TARGET_QUOTED',sourceCustody:'BACKEND_LOCAL_QUORUM',targetClaimCustody:'DEVICE_ROOT_NOTE',duplicateAdmissionRejected:true,observationNoNewEffect:true,sameOriginalAfterRestart:true,nativeFinalityObserved:true,nativeBroadcastAttempts:1,graphBroadcastAttempts:1,claimDomain:h(801),graphDomainCommitment:h(802),targetClaimDomain:h(803),targetAmountAtomic:'321',btcNativeIdSHA256:h(804),solNativeIdSHA256:h(805),solWireSHA256:h(806),quoteSHA256:h(807)}};
 for(const flag of ['publicNetwork','physicalPhoneEstablished','reactRendererEstablished','nativeSelfCustody','independentOperators','fullWalletAcceptance','nativeProcessRestartEstablished','wholeBackendCrashRecoveryEstablished','crossNetworkGraphAcceptance','originalDeviceRootBtcNoteExitEstablished','originalDeviceRootSolNoteExitEstablished','originalDeviceRootSplNoteExitEstablished'])v[flag]=false;
 assert.equal(p.assertSplSourceResult(v).originalDeviceRootSplSourceNoteExitEstablished,true);
 for(const change of [x=>x.sourceProofs.pop(),x=>x.sourceProofs[0].claimDomain=x.originalSource.targetClaimDomain,x=>x.sourceProofs[6].relation='ready',x=>x.sourceProofs[0].proofSHA256=x.proofs[0].proofSHA256,x=>x.sourceProofs[1].evidence.runId=x.proofs[1].evidence.runId,x=>x.loss.totalProofCountAfterRestart=15,x=>x.originalSource.observationNoNewEffect=false,x=>x.originalDeviceRootSplNoteExitEstablished=true]){const copy=structuredClone(v);change(copy);assert.throws(()=>p.assertSplSourceResult(copy));}
 const flow=await readFile(join(root,'scripts/validation/device-root-native-claim-v3/flow.mjs'),'utf8'),a=flow.indexOf('function selectFixedDeviceRootClaimFinancialProfileV3('),b=flow.indexOf('export async function runOriginalDeviceRootBtcFinancialV3',a);assert.ok(a>0&&b>a);
 const keys=['PROFILE','RESULT','SOL_PROFILE','SOL_RESULT','SPL_PROFILE','SPL_RESULT','SPL_SOURCE_PROFILE','SPL_SOURCE_RESULT','createOriginalDeviceRootBtcClaimExitLocalOperatorV3','createOriginalDeviceRootSolClaimExitLocalOperatorV3','createOriginalDeviceRootSplClaimExitLocalOperatorV3','createOriginalDeviceRootSplSourceClaimExitLocalOperatorV4','sourcePins','sourcePinsSol','sourcePinsSpl','sourcePinsSplSource','assertResult','assertSolResult','assertSplResult','assertSplSourceResult'],values=keys.map(k=>k.endsWith('PROFILE')||k.endsWith('RESULT')?k:()=>{});
 const select=Function('assert',...keys,flow.slice(a,b)+'return selectFixedDeviceRootClaimFinancialProfileV3;')(assert,...values),chosen=select(['node','fixed','--spl-source']);assert.equal(chosen.entry,'run-spl-source.mjs');assert.equal(chosen.source,true);assert.equal(chosen.create,values[keys.indexOf('createOriginalDeviceRootSplSourceClaimExitLocalOperatorV4')]);assert.equal(select(['node','fixed','--spl']).source,undefined);assert.throws(()=>select(['node','fixed','--spl-source','--spl']));
 // Only DATA validation is exercised here, never native/proof acceptance.
 const supervisor=await readFile(join(root,'tests/integration/native/native-flow-supervisor.mjs'),'utf8');assert.ok(supervisor.includes('deviceRootSplSourceOriginalNoteV4:Object.freeze('));assert.ok(supervisor.includes('scoped=deviceRootBtcPolicyV3.assertSplSourceResult(result)'));assert.ok(supervisor.includes('deviceRootBtcPolicyV3.assertSplSourceRelease();'));
});
