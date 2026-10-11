import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformDiagnostics, platformDiagnosticSnapshot } from '../src/diagnostics.mjs';
import { createPlatformPool } from '../src/database-pool.mjs';
import { EventEmitter } from 'node:events';

test('diagnostics accept only fixed event codes and never caller payloads, messages or identifiers', () => {
  const lines = [], diagnostic = createPlatformDiagnostics({ write: value => lines.push(value), now: () => 123456 });
  assert.equal(diagnostic.emit('ADAPTER_FAILED'), true);
  assert.equal(diagnostic.emit('ADAPTER_FAILED', new Error('private SQL URL')), false);
  assert.equal(diagnostic.emit({ code: 'SQL_OPERATION_FAILED', privateKey: 'secret' }), false);
  assert.equal(diagnostic.emit('0xsecret'), false);
  assert.deepEqual(lines.map(JSON.parse), [{ version: 1, service: 'lianum-platform', component: 'adapter',
    code: 'ADAPTER_FAILED', minute: 2, count: 1 }]);
  assert.equal(diagnostic.snapshot().counts.ADAPTER_FAILED, 1);
});
test('event floods are bounded, counted and resume in the next window; sink errors never escape', () => {
  let now = 0; const lines = [];
  const diagnostic = createPlatformDiagnostics({ write: value => lines.push(value), now: () => now, limit: 2 });
  for (let i = 0; i < 100; i++) diagnostic.emit('SQL_OPERATION_FAILED');
  assert.equal(lines.length, 2); assert.equal(diagnostic.snapshot().dropped, 98);
  assert.equal(diagnostic.snapshot().counts.SQL_OPERATION_FAILED, 100);
  now = 60000; diagnostic.emit('SQL_OPERATION_FAILED'); assert.equal(lines.length, 3);
  const broken = createPlatformDiagnostics({ write: () => { throw Error('broken sink'); } });
  assert.equal(broken.emit('ADAPTER_FAILED'), false);
});
test('real Pool error listeners retain component diagnostics without logging connection details', async () => {
  const before = platformDiagnosticSnapshot().counts;
  const pool = createPlatformPool('postgresql://not-connected:private@127.0.0.1:1/not-connected');
  try {
    pool.emit('error', new Error('private URL must not escape'));
    const client = new EventEmitter(); pool.emit('connect', client);
    client.emit('error', new Error('private SQL must not escape'));
    const after = platformDiagnosticSnapshot().counts;
    assert.equal(after.SQL_IDLE_CONNECTION_ERROR, before.SQL_IDLE_CONNECTION_ERROR + 1);
    assert.equal(after.SQL_ACTIVE_CONNECTION_ERROR, before.SQL_ACTIVE_CONNECTION_ERROR + 1);
  } finally { await pool.end(); }
});
