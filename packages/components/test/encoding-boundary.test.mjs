/** Moving framing ownership must keep the exact objects and rejection behavior. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as backendCommitments from '@lianum/backend/encoding/commitments';
import * as backendStatements from '@lianum/backend/encoding/statements';
import * as commitments from '@lianum/components/encoding/commitments';
import * as statements from '@lianum/components/encoding/statements';

test('backend compatibility entries expose the same canonical framing objects', () => {
  for (const [old, canonical] of [[backendCommitments, commitments], [backendStatements, statements]]) {
    assert.deepEqual(Object.keys(old), Object.keys(canonical));
    for (const name of Object.keys(canonical)) assert.equal(old[name], canonical[name], name);
  }
});

test('the public contract still rejects getters and proxies without invoking them', () => {
  let accessed = false;
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { accessed = true; return 'secret'; } });
  assert.throws(() => commitments.exactRecord(getter, ['value']), /COMMITMENT_DATA_FIELDS/);
  assert.throws(() => commitments.exactRecord(new Proxy({}, {
    getPrototypeOf() { accessed = true; throw Error('must not execute'); },
  }), []), /COMMITMENT_PLAIN_RECORD/);
  assert.equal(accessed, false);
});
