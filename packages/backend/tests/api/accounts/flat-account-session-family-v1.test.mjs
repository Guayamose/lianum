/** Real session families and queues; the lower keeper is inert and owns no funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlatAccountSessionFamilyV1} from '../../../src/api/accounts/flat-account-session-core.mjs';
import * as canonical from '../../../src/api/accounts/flat-account-session-owner-v1.mjs';
import * as compatibility from '../../../src/api/accounts/flat-account-session.mjs';

function fixture() {
  let reads = 0;
  const ownerView = async () => ({available: '10'}), config = {}, authority = {};
  const keeper = {
    async snapshot() {reads++; return {version:1,revision:0,storageAvailable:true,requests:[]};},
    async prepare() {}, async execute() {}, async reconcile() {}, async recover() {},
    async restartCoordinator() {}, async close() {},
  };
  const family = buildFlatAccountSessionFamilyV1({assertOriginalGenericAccountKeeperV1(value, expected) {
    assert.equal(value,keeper); assert.equal(expected.config,config); assert.equal(expected.authority,authority);
  }});
  return {family,keeper,config,authority,ownerView,reads:()=>reads};
}

test('generic session family rejects foreign and copied handles; compatibility shares canonical function identity', async () => {
  const f=fixture(), session=await f.family.createFlatAccountSession({keeper:f.keeper,ownerHandoff:{ownerView:f.ownerView}});
  const other=fixture();
  for(const value of [session,{...session},new Proxy(session,{})]) {
    assert.throws(()=>other.family.assertFlatAccountSession(value),{code:'FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED'});
    assert.throws(()=>canonical.assertFlatAccountSession(value),{code:'FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED'});
  }
  assert.throws(()=>f.family.assertFlatAccountSession({...session}),{code:'FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED'});
  assert.equal(compatibility.createFlatAccountSession,canonical.createFlatAccountSession);
  assert.equal(compatibility.assertFlatAccountSession,canonical.assertFlatAccountSession);
  await session.close();
});

test('owner observation preserves original view, keeper binding and closed-session fence without exposing references', async () => {
  const f=fixture(), session=await f.family.createFlatAccountSession({keeper:f.keeper,ownerHandoff:{ownerView:f.ownerView}});
  const expected={ownerView:f.ownerView,config:f.config,authority:f.authority};
  assert.throws(()=>f.family.assertFlatAccountOwnerSessionBindingV1(session,{...expected,ownerView:async()=>({})}),{code:'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED'});
  const before=f.reads();
  const snapshot=await f.family.readFlatAccountOwnerSessionSnapshotV1(session,expected);
  assert.equal(f.reads(),before+1);assert.deepEqual(snapshot.requests,[]);assert.equal(snapshot.observation,'CURRENT');
  assert.equal(Object.hasOwn(snapshot,'keeper'),false);assert.equal(Object.hasOwn(snapshot,'authority'),false);
  await session.close();
  await assert.rejects(f.family.readFlatAccountOwnerSessionSnapshotV1(session,expected),{code:'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED'});
});
