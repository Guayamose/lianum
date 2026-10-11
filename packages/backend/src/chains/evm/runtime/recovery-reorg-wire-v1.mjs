/** Reemit an already authenticated retained wire. The caller must consume its
 * private original token before entering. All chain I/O stays with that runtime;
 * constructing another mechanism cannot obtain a canonical token or RPC port. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertSignedEvmTransaction} from '../contracts/transaction-wire-codec.mjs';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const cloned=value=>freeze(structuredClone(value)),sha=value=>createHash('sha256').update(value).digest('hex');
export async function reemitRetainedRecoveryWireV1(saved,{transactions,block,assertCanonical,transaction,receipt,rpc,clock,assertAlive,mineAt,checkReceipt,markUncertain}){
      try {
      const originals = transactions.filter(item => item.label === 'flat-execution-recovery-' + saved.ref
        && item.transactionHash === saved.transactionHash);
      assert.equal(originals.length, 1, 'F_REORG_ORIGINAL_LOCAL_WIRE_REQUIRED'); const entry = originals[0];
      assert.ok(entry.localSigned && entry.phase === 'mined' && entry.receipt.status === '0x1' && !entry.nativeFReorg,
        'F_REORG_ORIGINAL_CONFIRMED_LOCAL_WIRE_REQUIRED');
      assert.deepEqual(entry.receipt, saved.oldReceipt); assert.equal(entry.request.data, saved.calldata);
      assert.equal(entry.request.to, saved.oldReceipt.to); assert.equal(entry.transactionHash, entry.localSigned.nativeId);
      assert.equal(entry.localSigned.expected.data, saved.calldata); assert.equal(entry.localSigned.expected.from, entry.request.from);
      assert.equal(entry.localSigned.expected.to, entry.request.to); assert.equal(entry.localSigned.expected.value, '0');
      assert.equal(BigInt(entry.localSigned.expected.nonce), BigInt(entry.senderNonce));
      const verified = assertSignedEvmTransaction(entry.localSigned.nativeWire, entry.localSigned.expected);
      assert.equal(verified.nativeId, saved.transactionHash, 'F_REORG_ORIGINAL_SIGNATURE_HASH');
      assert.equal(sha(Buffer.from(saved.calldata.slice(2), 'hex')), saved.calldataSHA256, 'F_REORG_ORIGINAL_CALLDATA_HASH');
      await saved.revalidate(); saved.assertCurrent();
      assert.deepEqual(await block(), saved.parent, 'F_REORG_EXACT_PARENT_REQUIRED'); await assertCanonical(saved.parent);
      assert.equal(await transaction(saved.transactionHash), null, 'F_REORG_OLD_TRANSACTION_PRESENT');
      assert.equal(await receipt(saved.transactionHash), null, 'F_REORG_OLD_RECEIPT_PRESENT');
      assert.deepEqual(await rpc('eth_pendingTransactions'), [], 'F_REORG_FOREIGN_PENDING_TRANSACTION');
      assert.equal(await rpc('eth_getTransactionCount', [entry.request.from, 'latest']), entry.senderNonce, 'F_REORG_ORIGINAL_NONCE_REQUIRED');
      assert.equal(await rpc('eth_getTransactionCount', [entry.request.from, 'pending']), entry.senderNonce, 'F_REORG_ORIGINAL_PENDING_NONCE_REQUIRED');
      // This authenticated rollback acknowledges the real original parent. It
      // does not alter genesis, lifetime, F cutoff or observed wallclock.
      clock.rewind(BigInt(saved.parent.timestamp));
      const inclusion = clock.observed ? await clock.nextObservedSecond() :
        [BigInt(saved.parent.timestamp) + 1n, BigInt(saved.includedHeader.timestamp) + 1n, BigInt(saved.settleBefore)].reduce((a,b)=>a>b?a:b);
      assert.ok(inclusion >= BigInt(saved.settleBefore), 'F_REORG_ORIGINAL_CUTOFF_REQUIRED');
      await saved.revalidate(); saved.assertCurrent();
      assert.deepEqual(await block(), saved.parent, 'F_REORG_PARENT_CHANGED_BEFORE_SEND');
      assert.equal(await rpc('eth_getTransactionCount', [entry.request.from, 'latest']), entry.senderNonce, 'F_REORG_ORIGINAL_NONCE_REQUIRED');
      assert.equal(await rpc('eth_getTransactionCount', [entry.request.from, 'pending']), entry.senderNonce, 'F_REORG_ORIGINAL_PENDING_NONCE_REQUIRED');
      assert.deepEqual(await rpc('eth_pendingTransactions'), [], 'F_REORG_FOREIGN_PENDING_TRANSACTION');
      assert.equal(await transaction(saved.transactionHash), null, 'F_REORG_OLD_TRANSACTION_PRESENT');
      assert.equal(await receipt(saved.transactionHash), null, 'F_REORG_OLD_RECEIPT_PRESENT');
      saved.assertCurrent(); assertAlive();
      entry.nativeFReorg = { schema: 'ORIGINAL_NATIVE_F_REEMISSION_V1', id: saved.id,
        phase: 'OBSERVATION_PENDING', originalReceipt: cloned(entry.receipt), originalHeader: cloned(saved.includedHeader) };
      try {
        assert.equal(await rpc('eth_sendRawTransaction', [entry.localSigned.nativeWire]), saved.transactionHash, 'F_REORG_EXACT_WIRE_HASH');
        await mineAt(inclusion); const included = await receipt(saved.transactionHash);
        assert.ok(included && included.status === '0x1', 'F_REORG_ORIGINAL_REEMISSION_UNRESOLVED');
        assert.equal(included.transactionHash, saved.transactionHash); await checkReceipt(included); await assertCanonical(included);
        entry.receipt = included; entry.gasUsed = BigInt(included.gasUsed).toString();
        entry.nativeFReorg.phase = 'RECONFIRMED'; entry.nativeFReorg.receipt = cloned(included);
        return cloned(included);
      } catch (error) { markUncertain(); throw error; }
      } catch (error) { markUncertain(); throw error; }
}
