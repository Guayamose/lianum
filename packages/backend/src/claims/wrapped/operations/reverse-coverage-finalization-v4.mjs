import assert from 'node:assert/strict';

/** @typedef {{readVault:()=>Promise<unknown>,current:()=>Promise<void>,
 * quiesce:()=>Promise<unknown>,assertQuiescent:(quiet:unknown)=>void,
 * assertLive:()=>void,snapshot:()=>unknown,now:()=>number,started:number,
 * retain:(snapshot:unknown)=>void}} FinalizationPorts */

/** Complete the final reads, native quiescence and deadline check. The original
 * serial owner selects these fixed ports only for a private reverse ticket and
 * retains the snapshot in its own WeakMap. This function issues no capability.
 * @param {FinalizationPorts} ports */
export async function readOriginalReverseCoverageV4(ports) {
  await ports.readVault();
  await ports.current();
  const quiet = await ports.quiesce();
  return quiet;
}

/** Finish synchronously, with no promise continuation after the private
 * snapshot is retained. @param {FinalizationPorts} ports @param {unknown} quiet */
export function finalizeOriginalReverseCoverageV4(ports, quiet) {
  ports.assertQuiescent(quiet);
  ports.assertLive();
  const snapshot = ports.snapshot(), elapsed = ports.now() - ports.started;
  assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000,
    'CLAIM_OPERATOR_AUDIT_TOO_OLD');
  ports.retain(snapshot);
}
