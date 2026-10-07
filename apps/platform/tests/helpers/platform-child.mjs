// Real HTTP/process/database integration fixture. The executor writes only a
// test dispatch counter; it has no chain adapter, proofs, custody or funds.
import { createPostgresAuthorizationStore, authorizationKey } from '../../src/authorization-store.mjs';
import { startPlatformServer } from '../../src/server.mjs';
import { createPlatformPool } from '../../src/database-pool.mjs';
import { errorMonitor } from 'node:events';

const pool = createPlatformPool(process.env.LIANUM_TEST_DATABASE_URL);
// errorMonitor observes without handling EventEmitter errors. Removing the
// production listener still kills this process and makes the restart test fail.
pool.on(errorMonitor,()=>process.stdout.write('{"testEvent":"SQL_IDLE_ERROR"}\n'));
const store = await createPostgresAuthorizationStore(pool);
await pool.query('CREATE TABLE IF NOT EXISTS test_dispatches(id bigserial PRIMARY KEY, authorization_key text NOT NULL)');
const executor = {
  capabilities: { prepare: true, execute: true, reconcile: true, recover: true },
  async submit(challenge) {
    if (challenge.intent.recipient === 'crash_before_effect') process.exit(73);
    await pool.query('INSERT INTO test_dispatches(authorization_key) VALUES($1)', [authorizationKey(challenge)]);
    if (challenge.intent.recipient === 'crash_after_effect') process.exit(74);
    if (challenge.intent.recipient === 'lost_response') throw new Error('TEST_LOST_REPLY');
    return { admitted: true };
  },
};
const port = Number(process.env.LIANUM_TEST_PORT);
const origin = `http://127.0.0.1:${port}`;
const server = await startPlatformServer({ origin, port, store, executor, allowInsecureLocalhost: true });
process.stdout.write(JSON.stringify({ port: server.port, origin }) + '\n');
process.once('SIGTERM', () => { void server.close().then(() => store.close()); });
