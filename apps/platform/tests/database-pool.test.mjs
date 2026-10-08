/** A controlled PostgreSQL wire peer deliberately stops replying. This tests
 * the actual pg client and pool transport deadline; it is not a SQL fixture. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createPlatformPool } from '../src/database-pool.mjs';
import { createPostgresAuthorizationStore } from '../src/authorization-store.mjs';

function message(type, payload) {
  const size = Buffer.alloc(4);
  size.writeInt32BE(payload.length + 4);
  return Buffer.concat([Buffer.from(type), size, payload]);
}
async function silentPeer(t) {
  const sockets = new Set(), queries = [];
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    let bytes = Buffer.alloc(0), started = false;
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (!started) {
        if (bytes.length < 4 || bytes.length < bytes.readInt32BE(0)) return;
        bytes = bytes.subarray(bytes.readInt32BE(0));
        started = true;
        socket.write(Buffer.concat([message('R', Buffer.alloc(4)), message('Z', Buffer.from('I'))]));
      }
      while (bytes.length >= 5 && bytes.length >= 1 + bytes.readInt32BE(1)) {
        const length = 1 + bytes.readInt32BE(1), type = String.fromCharCode(bytes[0]);
        const payload = bytes.subarray(5, length); bytes = bytes.subarray(length);
        if (type === 'Q') {
          const query = payload.subarray(0, -1).toString(); queries.push(query);
          if (query.startsWith('CREATE TABLE')) socket.write(Buffer.concat([
            message('C', Buffer.from('CREATE TABLE\0')), message('Z', Buffer.from('I')),
          ]));
          // Every subsequent query receives no bytes. The TCP connection stays
          // open, so connectionTimeoutMillis/statement_timeout cannot help.
        }
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  const pool = createPlatformPool(`postgresql://test:test@127.0.0.1:${server.address().port}/test`);
  t.after(() => pool.end());
  return { pool, sockets, queries };
}
test('established silent SQL transport times out and removes the exact pooled connection', { timeout: 12_000 }, async t => {
  const f = await silentPeer(t), began = Date.now();
  await assert.rejects(f.pool.query('SELECT 1'), /Query read timeout/);
  assert.ok(Date.now() - began >= 4500 && Date.now() - began < 10_000);
  assert.equal(f.pool.idleCount, 0);
  assert.equal(f.pool.totalCount, 0);
  assert.deepEqual(f.queries, ['SELECT 1']);
});
test('silent transaction is discarded instead of queueing ROLLBACK or recycling uncertain state', { timeout: 12_000 }, async t => {
  const f = await silentPeer(t);
  const store = await createPostgresAuthorizationStore(f.pool), began = Date.now();
  await assert.rejects(store.consume({ ownerPublicKey: 'public', intent: { requestId: 'original', action: 'execute' } }, Date.now()), /Query read timeout/);
  assert.ok(Date.now() - began >= 4500 && Date.now() - began < 10_000);
  assert.equal(f.pool.idleCount, 0);
  assert.equal(f.pool.totalCount, 0);
  assert.equal(f.queries.at(-1), 'BEGIN');
  assert.equal(f.queries.includes('ROLLBACK'), false);
  assert.equal(f.queries.includes('COMMIT'), false);
});
