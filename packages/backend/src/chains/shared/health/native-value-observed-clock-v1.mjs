/** Pure clock DATA validation; no runtime, clock source, signer or authority.
 * The fixed original receiver samples Date.now privately and passes that exact
 * observation. Supplying public numbers cannot advance an owned process. */
import assert from 'node:assert/strict';
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&value.length<=16,'NATIVE_VALUE_OBSERVED_CLOCK_INTEGER');const n=BigInt(value);assert.ok(n<=BigInt(Number.MAX_SAFE_INTEGER),'NATIVE_VALUE_OBSERVED_CLOCK_RANGE');return n;};
export function observedNativeValueReceiverSecond(previousSecond,observedMilliseconds){
 const previous=uint(previousSecond),now=uint(observedMilliseconds)/1000n;
 assert.ok(now>=previous,'LOCAL_OBSERVED_CLOCK_ROLLBACK');return now;
}

/** Read-only scheduling bound. It neither waits nor promises inclusion. */
export function observedNativeValueInclusionSecond(previousSecond,observedMilliseconds){
 const previous=BigInt(previousSecond),now=observedNativeValueReceiverSecond(previousSecond,observedMilliseconds);
 return now>previous?now:previous+1n;
}
/** Check the existing attempt's monotonic deadline; never renew its origin. */
export function assertObservedNativeValueWaitBudgetV2(budget,now){
 assert.ok(budget,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_REQUIRED');
 const elapsed=now-budget.started;
 assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<120000,'ECONOMIC_OBSERVED_ORIGINAL_WAIT_TIMEOUT');
 return budget;
}
/** Original next-second wait, using only the caller's fixed clock ports. */
export async function waitObservedNativeValueNextSecondV1(bounded,{lastSecond,assertAlive,monotonicNow,wallMilliseconds,delay}){
 const started=bounded?monotonicNow():null;
 const waitGuard=()=>{if(bounded){assertAlive();assertObservedNativeValueWaitBudgetV2({started},monotonicNow());}};
 waitGuard();let now=observedNativeValueReceiverSecond(lastSecond().toString(),String(wallMilliseconds()));
 while(now===lastSecond()){await delay(25);assertAlive();waitGuard();
  now=observedNativeValueReceiverSecond(lastSecond().toString(),String(wallMilliseconds()));}
 waitGuard();return now;
}
/** Continue one existing attempt. Its owner supplies an unchanged budget and
 * checks the target against the original runtime before entering this loop. */
export async function waitObservedNativeValueTargetV2(target,{lastSecond,assertAlive,assertBudget,wallMilliseconds,delay}){
 for(;;){
  assertAlive();assertBudget();
  const now=observedNativeValueReceiverSecond(lastSecond().toString(),String(wallMilliseconds()));
  assertBudget();if(now>=target)return;
  await delay(25);assertAlive();assertBudget();
 }
}
