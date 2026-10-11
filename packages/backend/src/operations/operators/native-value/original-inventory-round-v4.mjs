import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

/** @typedef {{nativeGid:string, observation:{evidenceUntil:string}, [field:string]:unknown}} NativeFacts */
/** @typedef {{nativeId:string, facts:NativeFacts, [field:string]:unknown}} NativeOriginal */
/** @typedef {{blockHeight:string, blockId:string, [field:string]:unknown}} Watermark */
/** @typedef {{digest:string, [field:string]:unknown}} Certificate */
/** @typedef {{original:NativeOriginal, watermark:Watermark, status:'live'|'adverse'|'unknown', reason:string|null,
 * lastCheckedAt:string, maximumEvidenceUntil:string, history:Certificate[], pending:({digest:string, [field:string]:unknown})|null}} Entry */
/** @typedef {{profileCommitment:string, entries:Entry[]}} Inventory */
/** @typedef {{lastClock:string, inventories:Inventory[],
 * authorizations:{signature:unknown|null,digest:string}[], checkpoints:{signature:unknown|null,digest:string}[]}} InventoryState */
/** @typedef {{revision:string, state:InventoryState}} InventoryRecord */
/** @typedef {{status:'live',reason:null,original:NativeOriginal,observed:boolean,nativeReadCount:string,sourceStatus:string,sourceFailureCode?:string|null}
 * | {status:'unknown'|'adverse',reason:string,observed:boolean,nativeReadCount:string,sourceStatus:string,sourceFailureCode?:string|null}} Observation */
/** @typedef {{profileCommitment?:string,nativeId?:string,nativeGid?:string,status?:string,reason:string|null,sourceFailureCode?:string|null}} Blocker */
/** @typedef {{profiles:{profile:object}[]}} Binding */
/** @typedef {{store:{load():Promise<InventoryRecord>,commit(input:{expectedRevision:string,nextState:InventoryState}):Promise<InventoryRecord>}}} Resources */
/** @typedef {{bound:{binding:Binding,resources:Resources,policies:object[]}, record:InventoryRecord,
 * active:{view:{head:{timestamp:string,[field:string]:unknown}},timing:{operation:string}}}} InventoryScope */
/** @typedef {{poolIndex:number,profileCommitment:string,nativeId:string}} CertificationRequest */
/** @typedef {{
 * copy:<T>(value:T)=>T, freeze:<T>(value:T)=>T,
 * equal:(actual:unknown,expected:unknown)=>void,
 * exactRecord:(value:unknown,fields:string[])=>void, inputUint:(value:string)=>bigint,
 * validateNativeValueOperatorInventory:(state:InventoryState,binding:Binding)=>InventoryState,
 * nativeValueWatermark:(facts:NativeFacts)=>Watermark, MAX_CERTIFICATES_PER_ORIGINAL:number,
 * owned:()=>void, poison:()=>void, timedStore:<T>(kind:'load'|'commit',work:()=>Promise<T>)=>Promise<T>,
 * current:()=>Promise<void>, observe:(index:number,nativeId:string,entry:Entry|undefined)=>Promise<Observation>,
 * profileCommitment:(profile:object)=>string, encodeFacts:(facts:NativeFacts,policy:object)=>Buffer, sha256:(bytes:Buffer)=>string,
 * bytes32:(value:string,nonzero:boolean)=>unknown, pool:(value:number)=>unknown,
 * serial:<T>(poolIndex:number,work:()=>Promise<T>,shared:object|null)=>Promise<T>,
 * timingPhase:(phase:string)=>void, coverage:(pending?:string)=>Promise<unknown>,
 * keySign:(bytes:Buffer)=>unknown, assertNativeValueSignature:(publicKey:object,signature:unknown,bytes:Buffer)=>void,
 * factsSchema:(policy:object)=>string, signerIndex:number, publicKey:object
 * }} InventoryPorts */

/** Complete journal, inventory audit and certification transitions. The
 * canonical operator supplies a closed scope and fixed original checks; it
 * retains key custody, source membership, quorum admission and the only
 * authenticated record. This mechanism registers no authority or token.
 * @param {InventoryScope} scope @param {InventoryPorts} ports
 */
export function createOriginalNativeInventoryRoundV4(scope, ports) {
  const {copy,freeze,equal,exactRecord,inputUint,validateNativeValueOperatorInventory,
    nativeValueWatermark,MAX_CERTIFICATES_PER_ORIGINAL,owned,poison,timedStore,current,observe,
    profileCommitment,encodeFacts,sha256,bytes32,pool,serial,timingPhase,coverage,keySign,
    assertNativeValueSignature,factsSchema,signerIndex,publicKey} = ports;
  async function unchanged() {
    try { equal(await timedStore('load', () => scope.bound.resources.store.load()), scope.record); }
    catch (cause) { poison(); throw new Error('NATIVE_VALUE_JOURNAL_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  /** @param {InventoryState} next */
  async function save(next) {
    try {
      owned(); await unchanged(); const state = validateNativeValueOperatorInventory(next, scope.bound.binding);
      // A new revision is unnecessary when fresh validation leaves the whole
      // retained state unchanged. Liveness, physical reads and validation above
      // retain their original order and failure/poison semantics.
      if (isDeepStrictEqual(state, scope.record.state)) return;
      const result = await timedStore('commit', () => scope.bound.resources.store.commit(freeze({ expectedRevision: scope.record.revision, nextState: copy(state) })));
      exactRecord(result, ['revision', 'state']); assert.equal(inputUint(result.revision), BigInt(scope.record.revision) + 1n); equal(result.state, state);
      equal(await timedStore('load', () => scope.bound.resources.store.load()), result); scope.record = copy(result);
    } catch (cause) { poison(); throw new Error('NATIVE_VALUE_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }

  /** @param {string | null} allowedPending */
  async function auditAll(allowedPending = null) {
    await current(); await unchanged(); const next = copy(scope.record.state);
    /** @type {Blocker[]} */
    const blockers = [];
    const observations = [];
    next.lastClock = scope.active.view.head.timestamp;
    for (let i = 0; i < next.inventories.length; i++) {
      const inventory = next.inventories[i], finality = new Map();
      if (inventory.entries.length >= 64) blockers.push({ profileCommitment: inventory.profileCommitment, reason: 'NATIVE_VALUE_INVENTORY_SATURATED' });
      for (const entry of inventory.entries) {
        // Deliberately includes expired, unadmitted, unsigned and adverse rows.
        const result = await observe(i, entry.original.nativeId, entry);
        observations.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId,
          attempted: true, nativeObservationReturned: result.observed, authenticatedNativeReadCount: result.nativeReadCount, sourceStatus: result.sourceStatus, priorAdverse: entry.status === 'adverse' });
        if (entry.status !== 'adverse') { entry.status = result.status; entry.reason = result.reason; }
        entry.lastCheckedAt = scope.active.view.head.timestamp;
        if (result.status === 'live') {
          entry.watermark = nativeValueWatermark(result.original.facts);
          const height = entry.watermark.blockHeight, prior = finality.get(height);
          if (prior && prior !== entry.watermark.blockId) { entry.status = 'adverse'; entry.reason = 'NATIVE_VALUE_PROFILE_FINALITY_DISAGREEMENT'; }
          finality.set(height, entry.watermark.blockId);
        }
        if (entry.status !== 'live') blockers.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId, nativeGid: entry.original.facts.nativeGid, status: entry.status, reason: entry.reason, sourceFailureCode: result.sourceFailureCode ?? null });
        if (entry.pending && entry.pending.digest !== allowedPending) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_UNFINISHED_SIGNING_INTENT' });
        if (entry.history.length >= MAX_CERTIFICATES_PER_ORIGINAL) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_SIGNED_HISTORY_SATURATED' });
      }
    }
    for (const authorization of next.authorizations)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_HEALTH_INTENT' });
    if (next.authorizations.length >= 256) blockers.push({ reason: 'NATIVE_VALUE_HEALTH_HISTORY_SATURATED' });
    for (const authorization of next.checkpoints)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_CHECKPOINT_INTENT' });

    if (!isDeepStrictEqual(next, scope.record.state)) await save(next);
    await current(); await unchanged();
    return freeze({ head: copy(scope.active.view.head), inventoryCount: String(observations.length), observations, blockers });
  }

  /** @param {CertificationRequest} request @param {object | null} shared */
  async function certify(request, shared = null) {
    const input = copy(request); exactRecord(input, ['poolIndex', 'profileCommitment', 'nativeId']); pool(input.poolIndex); bytes32(input.nativeId, true); bytes32(input.profileCommitment, true);
    return serial(input.poolIndex, async () => {
      scope.active.timing.operation = 'certify'; timingPhase('initial-coverage');
      await coverage(); const i = scope.bound.binding.profiles.findIndex(row => profileCommitment(row.profile) === input.profileCommitment);
      assert.ok(i >= 0, 'NATIVE_VALUE_UNREGISTERED_PROFILE'); const inventory = scope.record.state.inventories[i];
      let position = inventory.entries.findIndex(entry => entry.original.nativeId === input.nativeId);
      const previous = inventory.entries[position]; timingPhase('new-original-observation');
      const result = await observe(i, input.nativeId, previous);
      if (previous) {
        const checked = copy(scope.record.state), entry = checked.inventories[i].entries[position];
        checked.lastClock = scope.active.view.head.timestamp; entry.lastCheckedAt = scope.active.view.head.timestamp;
        if (entry.status !== 'adverse') { entry.status = result.status; entry.reason = result.reason; }
        if (result.status === 'live') entry.watermark = nativeValueWatermark(result.original.facts);
        timingPhase('checked-original-save'); await save(checked);
      }
      if(result.status!=='live'){
        const failure=new Error('NATIVE_VALUE_NEW_ORIGINAL_UNAVAILABLE');
        Object.assign(failure, {causeCodes:Object.freeze([result.reason,result.sourceFailureCode].filter(value=>typeof value==='string'))});
        throw failure;
      }
      const facts = result.original.facts, bytes = encodeFacts(facts, scope.bound.policies[i]), digest = sha256(bytes);
      const retained = previous?.history.find(certificate => certificate.digest === digest);
      if (retained) { timingPhase('retained-certificate-coverage'); await coverage(); return copy(retained); }
      const next = copy(scope.record.state);
      if (position < 0) {
        position = next.inventories[i].entries.length;
        next.inventories[i].entries.push({ original: result.original, history: [], pending: null, watermark: nativeValueWatermark(facts),
          status: 'live', reason: null, lastCheckedAt: scope.active.view.head.timestamp, maximumEvidenceUntil: '0' });
      }
      const entry = next.inventories[i].entries[position];
      entry.pending = { facts, frameHex: bytes.toString('hex'), digest }; next.lastClock = scope.active.view.head.timestamp;
      timingPhase('unsigned-intent-save'); await save(next); timingPhase('pre-key-coverage'); await coverage(digest);
      timingPhase('key-sign'); const signature = keySign(bytes); assertNativeValueSignature(publicKey, signature, bytes);
      const certificate = { schema: factsSchema(scope.bound.policies[i]), signerIndex: String(signerIndex), facts, frameHex: bytes.toString('hex'), digest, signature };
      const signed = copy(scope.record.state), row = signed.inventories[i].entries[position];
      row.history.push(certificate); row.pending = null;
      if (BigInt(facts.observation.evidenceUntil) > BigInt(row.maximumEvidenceUntil)) row.maximumEvidenceUntil = facts.observation.evidenceUntil;
      timingPhase('signed-save'); await save(signed); timingPhase('post-key-coverage'); await coverage();
      timingPhase('return'); return freeze(copy(certificate));
    }, shared);
  }

  return Object.freeze({unchanged,save,audit:auditAll,certify});
}
