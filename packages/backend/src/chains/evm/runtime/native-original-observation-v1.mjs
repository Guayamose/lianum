/** Read-only verification of retained wire records. The runtime owner checks
 * original ownership before calling; this cannot mark or mutate a runtime. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const cloned=value=>freeze(structuredClone(value));
export async function observeNativeValueOriginalRecordV1(query,{entries,profile,observed:observedClock,finality,chain,records}) {
 const {signedTransaction,health,transaction,receipt,assertCanonical,checkReceipt}=chain;
 const {cwd,readFile}=records;
      assert.ok(query && Object.getPrototypeOf(query) === Object.prototype, 'OWNED_NATIVE_VALUE_OBSERVATION_QUERY');
      assert.deepEqual(Reflect.ownKeys(query).sort(), ['nativeId', 'nativeWire', 'transactionSHA256'],
        'OWNED_NATIVE_VALUE_OBSERVATION_FIELDS');
      for (const name of ['nativeId', 'nativeWire', 'transactionSHA256'])
        assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(query, name) ?? {}, 'value'), 'OWNED_NATIVE_VALUE_OBSERVATION_DATA');
      const { nativeId, nativeWire, transactionSHA256 } = query;
      for (const value of [nativeId, transactionSHA256]) assert.ok(typeof value === 'string'
        && /^[0-9a-f]{64}$/.exec(value)?.[0] === value, 'OWNED_NATIVE_VALUE_OBSERVATION_HASH');
      const hash = '0x' + nativeId;
      const entry = entries.find(item => item.transactionHash === hash && item.signed);
      assert.ok(entry && entry.prepared.profile === profile,
        'OWNED_NATIVE_VALUE_ORIGINAL_SIGNED_REQUIRED');
      assert.equal(nativeWire, entry.signed.nativeWire, 'OWNED_NATIVE_VALUE_ORIGINAL_WIRE_CHANGED');
      assert.equal(transactionSHA256, entry.signed.transactionSHA256, 'OWNED_NATIVE_VALUE_ORIGINAL_SHA_CHANGED');
      const original = await signedTransaction(hash);
      assert.deepEqual(JSON.parse(await readFile(join(cwd, 'signed-' + nativeId + '.json'), 'utf8')),
        { schema: 'OWNED_EVM_SIGNED_WIRE_V2', prepared: entry.prepared, signed: original }, 'OWNED_NATIVE_VALUE_DURABLE_WIRE_CHANGED');
      assert.deepEqual(JSON.parse(await readFile(join(cwd, 'native-value-prepared-' + entry.prepared.binding.leaseId + '.json'), 'utf8')),
        { schema: 'OWNED_EVM_NATIVE_VALUE_PREPARED_V1', prepared: entry.prepared }, 'OWNED_NATIVE_VALUE_DURABLE_PREPARATION_CHANGED');
      await health();
      const observed = await transaction(hash), included = await receipt(hash);
      if (!included) return cloned({ status: observed ? 'pending' : 'unknown', nativeId, nativeWire: null });
      assert.ok(observed, 'OWNED_NATIVE_VALUE_TRANSACTION_MISSING');
      assert.equal(BigInt(observed.type), 0n, 'OWNED_NATIVE_VALUE_OBSERVED_TRANSACTION_TYPE');
      assert.equal(observed.blockHash, included.blockHash, 'OWNED_NATIVE_VALUE_OBSERVED_RECEIPT_JOIN');
      assert.equal(observed.blockNumber, included.blockNumber, 'OWNED_NATIVE_VALUE_OBSERVED_BLOCK_JOIN');
      assert.equal(observed.transactionIndex, included.transactionIndex, 'OWNED_NATIVE_VALUE_OBSERVED_INDEX_JOIN');
      const header = await assertCanonical(included);
      assert.equal(BigInt(header.number), BigInt(entry.prepared.head.number) + 1n, 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_HEIGHT');
      assert.equal(BigInt(header.timestamp), BigInt(entry.prepared.head.timestamp) + 1n, 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_TIME');
      assert.deepEqual(header.transactions, [hash], 'OWNED_NATIVE_VALUE_ORIGINAL_INCLUDED_BLOCK');
      assert.deepEqual(await transaction(hash), observed, 'OWNED_NATIVE_VALUE_TRANSACTION_CHANGED');
      await checkReceipt(included);
      if(observedClock&&included.status==='0x1'&&entry.finalityConfirmation?.phase!=='completed')
        return cloned({status:finality()?.entry===entry&&finality().failure?'unknown':'pending',nativeId,nativeWire:null});
      return cloned({ status: included.status === '0x1' ? 'observed' : 'adverse', nativeId,
        nativeWire: included.status === '0x1' ? original.nativeWire : null });
    }
