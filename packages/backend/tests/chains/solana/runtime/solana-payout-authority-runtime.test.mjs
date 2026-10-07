/** Exact runtime closure scheduling tests, with explicit synthetic authority
 * issuer and inert codec/signing/transport ports. Actual controller mint/opener
 * composition is separately covered by solana-payout-authority-controller tests.
 * This suite makes no claim of native execution, signing or measured run costs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRuntimeFixture, assertReleased, assertConsumedWithoutSend } from '../../../fixtures/chains/solana/runtime/solana-payout-authority-runtime.fixture.mjs';
function fixture(route, options = {}) {
  const tokens = new WeakMap(); let f;
  const controller = { openNativeClaimSolanaPayoutAuthority(token, close, genesis, prepared, record) {
    const original = tokens.get(token); assert.ok(original, 'TEST_PRIVATE_AUTHORITY_REQUIRED'); tokens.delete(token);
    assert.equal(close, f.close); assert.equal(genesis, 'genesis'); assert.equal(prepared, f.prepared);
    assert.equal(record, f.record()); assert.equal(record.phase, 'SIGNED_NOT_BROADCAST'); assert.equal(record.broadcastAttempts, 0);
    original.check(); f.events.push('token-open'); return original.gate;
  } };
  f = createRuntimeFixture(route, { ...options, payoutController: controller });
  f.mint = (started = f.clock.now, hooks = {}) => {
    const token = Object.freeze({ profile: 'TEST_ONLY_OPAQUE' });
    const check = () => assert.ok(f.clock.now - started >= 0 && f.clock.now - started < 30_000, 'TEST_AUTHORITY_TOO_OLD');
    let entered = false, consumed = false;
    tokens.set(token, { check, gate: Object.freeze({ originalAuditStarted: started, async beforeSend(value) {
      assert.equal(value, f.prepared); assert.equal(entered, false); entered = true;
      assert.equal(f.record().phase, 'BROADCAST_UNKNOWN'); assert.equal(f.record().broadcastAttempts, 1);
      f.events.push('fixed-async'); check(); await hooks.async?.(); check();
    }, assertBeforeSend(value) {
      assert.equal(value, f.prepared); assert.ok(entered && !consumed); consumed = true;
      f.events.push('fixed-sync'); hooks.sync?.(); check(); hooks.afterCheck?.(); queueMicrotask(() => f.events.push('microtask-after-sync'));
    } }) });
    return token;
  };
  f.authorized = hooks => ({ ...f.callbacks(), async beforeBroadcast() { return f.mint(f.clock.now, hooks); } });
  return f;
}
for (const route of ['refund', 'redeem']) for (const mode of ['transfer', 'resume']) {
  test(`${route}/${mode}: original authority and full observation pass after long preceding setup`, async () => {
    const f = fixture(route); if (mode === 'resume') f.reserve();
    const cb = f.authorized(); cb.beforeBroadcast = async () => {
      f.clock.now += 31_000; // Synthetic preceding view. Not a measurement.
      const started = f.clock.now; f.clock.now += 20_000;
      await f.revalidate(); f.clock.now += 9_999;
      return f.mint(started);
    };
    await f.start(mode, cb);
    assert.equal(f.record().phase, 'BROADCAST'); assert.equal(f.counters().sendCalls, 1);
    assert.equal(f.counters().signCalls, mode === 'transfer' ? 1 : 0);
    const e = f.events;
    for (const [a,b] of [['token-open','persist:BROADCAST_UNKNOWN'],['persist:BROADCAST_UNKNOWN','fixed-async'],
      ['fixed-async','fixed-sync'],['fixed-sync','send'],['send','microtask-after-sync']]) assert.ok(e.indexOf(a)<e.indexOf(b), `${a} before ${b}`);
    await assert.rejects(f.start('resume', f.authorized()), /FIRST_SEND_ONLY/); assertReleased(f);
  });
  for (const returned of [undefined, {}, Object.freeze({profile:'CLAIM_SOLANA_ORIGINAL_PAYOUT_AUTHORITY_V2'})]) {
    test(`${route}/${mode}: arbitrary callback result cannot mint authority ${String(returned)}`, async () => {
      const f = fixture(route); if (mode === 'resume') f.reserve();
      await assert.rejects(f.start(mode, {...f.callbacks(), async beforeBroadcast() {return returned;}}), /TEST_PRIVATE_AUTHORITY_REQUIRED/);
      assert.equal(f.record().phase, 'SIGNED_NOT_BROADCAST'); assert.equal(f.record().broadcastAttempts, 0);
      assert.equal(f.counters().sendCalls, 0); assertReleased(f);
    });
  }
  for (const which of ['native', 'authority']) test(`${route}/${mode}: stale ${which} cannot borrow the other fresh scope`, async () => {
    const f=fixture(route); if(mode==='resume') f.reserve();
    const cb=f.authorized(); cb.beforeBroadcast=async()=>{
      const started=f.clock.now; f.clock.now+=30_000;
      if(which==='authority') { await f.revalidate(); return f.mint(started); }
      return f.mint();
    };
    await assert.rejects(f.start(mode,cb),which==='native'?/NATIVE_OBSERVATION_TOO_OLD/:/TEST_AUTHORITY_TOO_OLD/);
    assert.equal(f.record().broadcastAttempts,0); assert.equal(f.counters().sendCalls,0); assertReleased(f);
  });
  for (const fault of ['native-fsync', 'native-final-await', 'authority-final-await', 'closed', 'shutdown', 'isolation', 'journal', 'process', 'record-identity', 'fee', 'intent', 'wire']) {
    test(`${route}/${mode}: ${fault} after latch has no resend`, async()=>{
      const f=fixture(route,{deadProcess:fault==='process',afterLatch({api,record,clock}) {
        if(fault==='native-fsync') clock.now+=30_000;
        if(fault==='closed') api.setState({closed:true});
        if(fault==='shutdown') api.setState({shuttingDown:true});
        if(fault==='isolation') api.setState({isolationFailure:Error('SOLANA_ISOLATION_FAILURE')});
        if(fault==='journal') api.setState({nativePersistenceFailure:Error('SOLANA_JOURNAL_UNCERTAIN')});
        if(fault==='record-identity') f.records.set(record.nativeId,structuredClone(record));
        if(fault==='fee') record.preparedFee='99';
        if(fault==='intent') record.intent.lamports='99';
        if(fault==='wire') record.nativeWire='wrong';
      }}); if(mode==='resume') f.reserve();
      const cb=f.authorized({async:async()=>{
        if(fault==='native-final-await'||fault==='authority-final-await') f.clock.now+=30_000;
      }});
      // Shift the native-only deadline relative to a fresh synthetic authority.
      if(fault.startsWith('native-')) cb.beforeBroadcast=async()=>{
        f.clock.now+=20_000; return f.mint(f.clock.now,{async:async()=>{if(fault==='native-final-await') f.clock.now+=10_000;}});
      };
      const reason=/TOO_OLD|CLOSED|ISOLATION|JOURNAL|DEAD|PRIVATE_IDENTITY|GENESIS_OR_FEE|ORIGINAL_INTENT|strictly equal/;
      // A deliberate wire mutation is not repaired by the host error wrapper.
      if(fault==='wire') {
        await assert.rejects(f.start(mode,cb),e=>{assert.match(e.cause?.message??'',reason);return true;});
        assert.equal(f.record().broadcastAttempts,1);assert.equal(f.counters().sendCalls,0);
      } else await assertConsumedWithoutSend(f,mode,f.start(mode,cb),reason);
    });
  }
  test(`${route}/${mode}: full native read that itself takes 30s cannot create usable freshness`,async()=>{
    const f=fixture(route,{nativeRead:async({clock})=>{clock.now+=30_000;}});if(mode==='resume')f.reserve();
    await assert.rejects(f.start(mode,f.authorized()),/NATIVE_OBSERVATION_TOO_OLD/);
    assert.equal(f.record().broadcastAttempts,0);assert.equal(f.counters().sendCalls,0);
  });
}
test('payout callback substitution fields are rejected before signing',async()=>{
  const f=fixture('redeem');await assert.rejects(f.start('transfer',{...f.authorized(),beforeSend(){},assertBeforeSend(){}}),/UNKNOWN_FIELD|RECORD|keys|KEYS|shape|EXACT/);
  assert.equal(f.counters().signCalls,0);assert.equal(f.counters().sendCalls,0);
});
for(const mode of ['transfer','resume']) test(`deposit/${mode}: original callbacks and outer timer remain`,async()=>{
  const f=createRuntimeFixture('deposit');if(mode==='resume')f.reserve();
  await f.start(mode);assert.equal(f.counters().sendCalls,1);assert.ok(f.events.includes('before-send'));assert.ok(f.events.includes('ingress-history'));
  const g=createRuntimeFixture('deposit');if(mode==='resume')g.reserve();const cb=g.callbacks();cb.beforeBroadcast=async()=>{g.clock.now+=30_000;};
  await assert.rejects(g.start(mode,cb),/SOLANA_BROADCAST_AUDIT_TOO_OLD/);assert.equal(g.record().broadcastAttempts,0);
});
test('production token gate has no await between final synchronous authority/native fences and sole send',()=>{
  const source=readFileSync(new URL('./owned-solana-runtime.mjs',import.meta.url),'utf8');
  const branch=source.slice(source.indexOf('          payoutAuthority.assertBeforeSend(activePrepared);'),source.indexOf('        const returned = await sendOwnedSolanaTransaction'));
  assert.doesNotMatch(branch.replace(/\/\/[^\n]*/g,''),/\bawait\b/);
  assert.match(branch,/assertPayoutTerminalWindows\(activePrepared, payoutAuthority\)/);
  assert.doesNotMatch(branch,/validateSolanaNonceBindingTransaction/);
});

for (const mode of ['transfer', 'resume']) test(`${mode}: synchronous codec work cannot outlive the original authority with a young native lease`,async()=>{
 const f=fixture('redeem',{decodeHook({clock,latched}){if(latched)clock.now+=1;}});if(mode==='resume')f.reserve();
 const cb=f.authorized();cb.beforeBroadcast=async()=>{const started=f.clock.now;f.clock.now+=29_999;await f.revalidate();return f.mint(started);};
 await assertConsumedWithoutSend(f,mode,f.start(mode,cb),/TEST_AUTHORITY_TOO_OLD/);
});
for (const which of ['native','authority']) test(`same-tick terminal window catches synchronous final-gate ${which} delay`,async()=>{
 const f=fixture('redeem');const cb=f.authorized();cb.beforeBroadcast=async()=>{const started=f.clock.now;f.clock.now+=29_999;
  if(which==='authority')await f.revalidate();
  return f.mint(which==='authority'?started:f.clock.now,{afterCheck(){f.clock.now+=1;}});
 };
 await assertConsumedWithoutSend(f,'transfer',f.start('transfer',cb),which==='native'?/NATIVE_OBSERVATION_TOO_OLD/:/ORIGINAL_AUTHORITY_TOO_OLD/);
});

for (const mode of ['transfer','resume']) test(`${mode}: synchronous native work after opening cannot cross authority deadline before latch`,async()=>{
 const f=fixture('redeem',{decodeHook({clock,events,latched}){if(!latched&&events.includes('token-open'))clock.now+=1;}});if(mode==='resume')f.reserve();
 const cb=f.authorized();cb.beforeBroadcast=async()=>{const started=f.clock.now;f.clock.now+=29_999;await f.revalidate();return f.mint(started);};
 await assert.rejects(f.start(mode,cb),/ORIGINAL_AUTHORITY_TOO_OLD/);
 assert.equal(f.record().phase,'SIGNED_NOT_BROADCAST');assert.equal(f.record().broadcastAttempts,0);assert.equal(f.counters().sendCalls,0);
});
