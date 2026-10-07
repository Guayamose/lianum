/** Host cancellation fixture; no native chain process or private material. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startBitcoinAcceptanceGuard } from '../bitcoin-runtime-guard.mjs';
const owned = spawn(process.execPath, ['-e', "process.stdin.resume();process.stdin.once('end',()=>process.exit(0));"],
  { stdio: ['pipe', 'ignore', 'ignore'] });
const exit = once(owned, 'exit'); let closeCalls = 0;
const guard = startBitcoinAcceptanceGuard(async () => {
  closeCalls++; owned.stdin.end();
  const [exitCode, signal] = await exit;
  return { childStopped: true, exitCode, signal, closeCalls };
}, async () => {});
console.log(JSON.stringify({ ready: true, ownedPID: owned.pid }));
await guard.failed;
const result = await guard.finish();
console.log(JSON.stringify(result));
