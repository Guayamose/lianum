/** Safe CLI: opens the real application disconnected, never synthetic balances,
 * native fixtures or proof jobs. Genuine sessions bind through private import. */
import assert from 'node:assert/strict';
import { startWalletApplication } from './server.mjs';
assert.equal(process.argv.length, 2, 'WALLET_CLI_NO_RUNTIME_OPTIONS');
const app = await startWalletApplication();
process.stdout.write(JSON.stringify({ origin: app.origin, connection: 'DISCONNECTED',
  notice: 'Application ready; private bootstrap must bind genuine original wallet sessions. No wallet or funds were created.' }) + '\n');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
