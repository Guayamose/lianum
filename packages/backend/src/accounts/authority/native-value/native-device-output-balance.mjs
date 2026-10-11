/** Read-only note projection. Original account/bridge checks, terms and path
 * verification are fixed by the caller; this function cannot issue an output. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
/** @typedef {{root:string,index:number,leaf:string,siblings:string[]}} NotePath */
/** @typedef {{jobId:string,consent:{custody:{rootId:string,noteRevision:number},statement:{inputNullifier:string},quoteId:string,depositJobId:string},
 * nativeOutcome:string|null,nativeTerminal:{transactionHash:string}|null,nativeFReorg?:{phase:string},nativeBinding:{changeCommitment:string,recoveryCommitment:string}}} OutputParent */
/** @typedef {{head:{number:string,hash:string,timestamp:string},ledger:{nullifiers:string[],commitments:string[],tree:{path(index:number):NotePath}}}} OutputView */
/** @param {object} bridge @param {unknown} input
 * @param {{format:{reference(value:unknown):void,bare(value:string):string},
 * reservations:{reservationRow(id:unknown):OutputParent,reservationObservation(row:OutputParent):Promise<{stage:string,observation:{transactionHash:string}}>,originalQuote(id:string):{preparation:unknown},reservationSubject(id:string,rootId:unknown,descriptor:unknown):{consent:{statement:{amount:string}}}},
 * execution:{deviceExecutionOriginal(bridge:object,row:OutputParent):{descriptor:unknown}},
 * chain:{nativeExecution:{snapshot(id:string):{outcome:string|null}},runtime:{receipt(hash:string):Promise<object|null>,checkReceipt(receipt:object):Promise<unknown>,assertCanonical(receipt:object):Promise<unknown>},reader:{read():Promise<OutputView>,assertCurrent(view:OutputView):Promise<unknown>}},
 * profile:{asset:{assetId:string,scope:string,policy:string,codeHash:string,assetIdentity:string},identity:{pool:string,domainCommitment:string}},
 * lifecycle:{continueWork():void},preparationTerms(preparation:unknown):{budget:string},verifyPath(path:NotePath):boolean,hash(value:unknown):string}} ports */
export async function readNativeDeviceOutputBalance(bridge,input,ports) {
    const {format,reservations,execution,chain,profile,lifecycle,preparationTerms,verifyPath,hash}=ports;
    exactRecord(input, ['parentJobId', 'rootId', 'noteRevision', 'changeNullifier', 'recoveryNullifier']);
    format.reference(input.changeNullifier);
    format.reference(input.recoveryNullifier);
    const parent = reservations.reservationRow(input.parentJobId),
      installation = execution.deviceExecutionOriginal(bridge, parent);
    assert.equal(input.rootId, parent.consent.custody.rootId, 'DEVICE_OUTPUT_ROOT_CHANGED');
    assert.ok(typeof input.noteRevision==='number'&&Number.isSafeInteger(input.noteRevision) && input.noteRevision >= parent.consent.custody.noteRevision, 'DEVICE_OUTPUT_CUSTODY_REVISION');
    const reserved = await reservations.reservationObservation(parent);
    assert.equal(reserved.stage, 'RESERVED', 'DEVICE_OUTPUT_ORIGINAL_S_REQUIRED');
    const sourceNullifier = parent.consent.statement.inputNullifier;
    assert.equal(new Set([sourceNullifier, input.changeNullifier, input.recoveryNullifier]).size, 3, 'DEVICE_OUTPUT_NULLIFIERS_CHANGED');
    if (parent.nativeOutcome !== null) {
      assert.ok(parent.nativeTerminal, 'DEVICE_OUTPUT_ORIGINAL_TERMINAL_REQUIRED');
      assert.equal(chain.nativeExecution.snapshot(parent.jobId).outcome, parent.nativeOutcome, 'DEVICE_OUTPUT_ORIGINAL_TERMINAL_CHANGED');
      const terminal = await chain.runtime.receipt('0x' + parent.nativeTerminal.transactionHash);
      assert.ok(terminal);
      await chain.runtime.checkReceipt(terminal);
      await chain.runtime.assertCanonical(terminal);
    }
    const quote = reservations.originalQuote(parent.consent.quoteId),
      deposit = reservations.reservationSubject(parent.consent.depositJobId, input.rootId, installation.descriptor),
      budget = BigInt(preparationTerms(quote.preparation).budget),
      view = await chain.reader.read();
    assert.ok(view.ledger.nullifiers.includes('0x' + sourceNullifier), 'DEVICE_OUTPUT_ORIGINAL_SOURCE_SPEND_REQUIRED');
    const outputNullifiers={change:input.changeNullifier,recovery:input.recoveryNullifier};
    /** @param {'change'|'recovery'} role @param {bigint} amount */
    function note(role, amount) {
      // Full-budget S inserts the original empty-change marker. It has an
      // inclusion path, but no positive note or withdrawal authority.
      assert.ok(amount > 0n || role === 'change' && amount === 0n, 'DEVICE_OUTPUT_POSITIVE_NOTE_REQUIRED');
      const commitment = parent.nativeBinding[role === 'change' ? 'changeCommitment' : 'recoveryCommitment'],
        nullifier = outputNullifiers[role];
      if (parent.nativeFReorg && parent.nativeFReorg.phase !== 'RECONFIRMED' || role === 'recovery' && parent.nativeOutcome !== 'RECOVERED') return {
        noteRole: role,
        commitment,
        nullifier,
        amount: amount.toString(),
        state: 'LOCKED',
        path: null
      };
      const indices = view.ledger.commitments.flatMap((leaf, index) => leaf === '0x' + commitment ? [index] : []);
      assert.equal(indices.length, 1, 'DEVICE_OUTPUT_ORIGINAL_NOTE_REQUIRED');
      const path = view.ledger.tree.path(indices[0]);
      assert.equal(verifyPath(path), true, 'DEVICE_OUTPUT_ORIGINAL_PATH');
      if (amount === 0n) assert.ok(!view.ledger.nullifiers.includes('0x' + nullifier), 'DEVICE_OUTPUT_EMPTY_CHANGE_SPENT');
      return {
        noteRole: role,
        commitment,
        nullifier,
        amount: amount.toString(),
        state: view.ledger.nullifiers.includes('0x' + nullifier) ? 'SPENT' : 'UNSPENT',
        path: {
          root: format.bare(path.root),
          index: path.index,
          leaf: format.bare(path.leaf),
          siblings: path.siblings.map(format.bare)
        }
      };
    }
    const change = note('change', BigInt(deposit.consent.statement.amount) - budget),
      recovery = note('recovery', budget);
    await chain.reader.assertCurrent(view);
    lifecycle.continueWork();
    return {
      parentJobId: parent.jobId,
      rootId: input.rootId,
      noteRevision: input.noteRevision,
      nativeBindingSHA256: hash(parent.nativeBinding),
      reservationTransactionHash: reserved.observation.transactionHash,
      assetId: profile.asset.assetId,
      pool: profile.identity.pool,
      poolTerms: {
        scope: profile.asset.scope,
        policy: profile.asset.policy,
        codeHash: profile.asset.codeHash,
        assetIdentity: profile.asset.assetIdentity,
        domainCommitment: profile.identity.domainCommitment
      },
      sourceNullifier,
      sourceNullifierSpent: true,
      nativeOutcome: parent.nativeOutcome,
      change,
      recovery,
      observed: {
        blockNumber: view.head.number,
        blockHash: view.head.hash,
        timestamp: view.head.timestamp
      }
    };
  }
