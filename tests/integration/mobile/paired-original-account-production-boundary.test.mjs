/** Unmocked native production brands: no factory succeeds, native/runtime/keys
 * are never created, and no callback or shaped object can create authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createPairedOriginalAccountActorV2 } from '../../../packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs';
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
const jwk = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).publicKey.export({ format: 'jwk' });
const devicePublicKey = '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
test('unmocked original session/native approval WeakMaps reject copies and shaped accounts before any caller method', async () => {
  let touched = false; const trap = () => { touched = true; throw Error('CALLER_CALLBACK'); };
  const input = { session: { snapshot: trap, reconcile: trap }, approval: { account: { config: {}, privateStatus: trap } },
    owner: { publicView: { summary: trap } }, origin: 'https://private-actor.example', devicePublicKey };
  await assert.rejects(createPairedOriginalAccountActorV2(input), /ORIGINAL_SESSION_REQUIRED/);
  assert.equal(touched, false);
  const keeper = Object.fromEntries(['prepare', 'execute', 'reconcile', 'recover', 'restartCoordinator', 'close'].map(name => [name, async () => {}]));
  keeper.snapshot = async () => ({ version: 1, revision: 0, storageAvailable: true, requests: [] });
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: trap } });
  try { await assert.rejects(createPairedOriginalAccountActorV2({ ...input, session }), /MANUAL_NOTE_ORIGINAL_REQUIRED/); }
  finally { await session.close(); }
  assert.equal(touched, false);
});
test('proxies, accessors, signature callbacks and extra constructor arguments are rejected by the private bootstrap', async () => {
  let touched = false;
  const normal = { session: {}, approval: {}, owner: {}, origin: 'https://private-actor.example', devicePublicKey };
  const getter = { ...normal }; Object.defineProperty(getter, 'session', { enumerable: true, get() { touched = true; return {}; } });
  for (const input of [new Proxy(normal, {}), getter, { ...normal, signer() { touched = true; } }])
    await assert.rejects(createPairedOriginalAccountActorV2(input), /ACTOR_FIELDS/);
  await assert.rejects(createPairedOriginalAccountActorV2(normal, {}), /ACTOR_ARGUMENTS/);
  assert.equal(touched, false);
});
