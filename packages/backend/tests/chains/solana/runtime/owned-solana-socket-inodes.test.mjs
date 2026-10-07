/** Synthetic scheduling checks only: controlled promises, no /proc reads,
 * nodes, network, timing measurements or proof execution.
 * Run: node --experimental-test-module-mocks --test <this file> */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';

let io;
const named = Object.fromEntries(Object.entries(fsp).filter(([key]) => key !== 'default' && key !== 'module.exports'));
mock.module('node:fs/promises', { exports: { ...named,
  readdir: (...args) => io.readdir(...args), readlink: (...args) => io.readlink(...args),
} });
const { readOwnedSolanaSocketInodes } = await import('../../../../src/chains/solana/runtime/owned-solana-socket-inodes.mjs');
const directory = '/proc/987654/fd';
const turn = () => new Promise(resolve => setImmediate(resolve));
const error = code => Object.assign(new Error(code), { code });

function controlled(names) {
  const result = { enumerations: [], calls: [], pending: [], active: 0, peak: 0 };
  io = {
    async readdir(path) { result.enumerations.push(path); assert.equal(path, directory); return [...names]; },
    readlink(path) {
      const name = path.slice(directory.length + 1);
      assert.equal(path, `${directory}/${name}`); assert.ok(names.includes(name));
      const call = { name, settled: false }; result.calls.push(call); result.pending.push(call);
      result.active++; result.peak = Math.max(result.peak, result.active);
      return new Promise((resolve, reject) => {
        call.finish = value => {
          assert.equal(call.settled, false); call.settled = true; result.active--;
          if (value instanceof Error) reject(value); else resolve(value);
        };
      });
    },
  };
  return result;
}
async function finishWaves(state, valueFor) {
  for (;;) {
    await turn();
    const pending = state.pending.splice(0).filter(call => !call.settled);
    if (!pending.length) break;
    for (const call of pending.reverse()) call.finish(valueFor(call));
  }
}

test('many descriptors use exactly 16 workers and retain every inode including duplicate aliases', async () => {
  const names = Array.from({ length: 513 }, (_, i) => String(i)), state = controlled(names);
  const target = name => Number(name) % 5 === 0 ? `/owned/file/${name}` : `socket:[${1000 + Number(name) % 73}]`;
  let settled = false;
  const inspection = readOwnedSolanaSocketInodes(directory).finally(() => { settled = true; });
  await turn();
  assert.equal(state.calls.length, 16); assert.equal(state.active, 16); assert.equal(settled, false);
  await finishWaves(state, call => target(call.name));
  const inodes = await inspection;
  assert.deepEqual(inodes, new Set(names.filter(name => Number(name) % 5 !== 0).map(name => String(1000 + Number(name) % 73))));
  assert.equal(state.peak, 16); assert.equal(state.active, 0);
  assert.deepEqual(state.calls.map(call => call.name), names); assert.ok(state.calls.every(call => call.settled));
  assert.deepEqual(state.enumerations, [directory]);
});

test('empty enumeration and nonsocket descriptors keep the original exact inode matching', async () => {
  let state = controlled([]);
  assert.deepEqual(await readOwnedSolanaSocketInodes(directory), new Set()); assert.equal(state.calls.length, 0);
  state = controlled(['0', '1', '2', '3', '4', '5', '6']);
  const targets = ['socket:[00123]', 'socket:[123]', 'socket:[123]extra', 'socket:[]', 'pipe:[123]', 'anon_inode:[eventpoll]', '/owned/socket:[4]'];
  const inspection = readOwnedSolanaSocketInodes(directory);
  await finishWaves(state, call => targets[Number(call.name)]);
  assert.deepEqual(await inspection, new Set(['00123', '123'])); assert.equal(state.active, 0);
});

test('ENOENT after enumeration is ignored without losing duplicate or later live socket descriptors', async () => {
  const state = controlled(Array.from({ length: 40 }, (_, i) => String(i)));
  const inspection = readOwnedSolanaSocketInodes(directory);
  await finishWaves(state, call => ['0', '15', '16', '39'].includes(call.name) ? error('ENOENT') : `socket:[${Number(call.name) % 3}]`);
  assert.deepEqual(await inspection, new Set(['0', '1', '2']));
  assert.equal(state.calls.length, 40); assert.equal(state.active, 0);
});

test('denied and other failed reads reject with the original error only after every FD drains', async () => {
  for (const code of ['EACCES', 'EPERM', 'EIO', 'ENOTDIR', 'EBADF', undefined]) {
    const names = Array.from({ length: 37 }, (_, i) => String(i)), state = controlled(names), failure = error(code);
    let settled = false;
    const inspection = readOwnedSolanaSocketInodes(directory);
    const rejected = assert.rejects(inspection, actual => actual === failure).then(() => { settled = true; });
    await turn(); state.calls[0].finish(failure); await turn();
    assert.equal(settled, false); assert.equal(state.active, 16); assert.equal(state.calls.length, 17);
    await finishWaves(state, call => `socket:[${call.name}]`);
    await rejected;
    assert.deepEqual(state.calls.map(call => call.name), names); assert.equal(state.active, 0); assert.equal(state.peak, 16);
  }
});

test('multiple failures choose enumeration order, never completion order, after draining all workers', async () => {
  // Deliberately not numerically sorted: readdir order is the original serial order.
  const names = ['90', '4', ...Array.from({ length: 40 }, (_, i) => String(100 + i))];
  const state = controlled(names), first = error('EACCES'), later = error('EPERM');
  let settled = false;
  const rejected = assert.rejects(readOwnedSolanaSocketInodes(directory), actual => actual === first).then(() => { settled = true; });
  await turn(); state.calls[1].finish(later); await turn();
  assert.equal(settled, false); assert.equal(state.calls[0].settled, false);
  await finishWaves(state, call => call.name === '90' ? first : `socket:[${call.name}]`);
  await rejected;
  assert.deepEqual(state.calls.map(call => call.name), names); assert.equal(state.active, 0);
});

test('readdir ENOENT and permission failures are not mistaken for disappearing descriptors', async () => {
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'EIO']) {
    const failure = error(code);
    io = { readdir() { throw failure; }, readlink() { assert.fail('no readlink after failed enumeration'); } };
    await assert.rejects(readOwnedSolanaSocketInodes(directory), actual => actual === failure);
  }
});

test('synchronous readlink failures still drain the pool and propagate the original failure', async () => {
  const names = Array.from({ length: 40 }, (_, i) => String(i)), state = controlled(names), failure = error('EIO');
  const readlink = io.readlink;
  io.readlink = path => { if (path === `${directory}/0`) throw failure; return readlink(path); };
  const rejected = assert.rejects(readOwnedSolanaSocketInodes(directory), actual => actual === failure);
  await finishWaves(state, call => `socket:[${call.name}]`); await rejected;
  assert.deepEqual(state.calls.map(call => call.name), names.slice(1)); assert.equal(state.active, 0); assert.equal(state.peak, 16);
});

test('overlapping inspections of the same PID enumerate and read independently without sharing outcomes', async () => {
  const names = Array.from({ length: 16 }, (_, i) => String(i)), state = controlled(names), denied = error('EPERM');
  let firstSettled = false;
  const first = assert.rejects(readOwnedSolanaSocketInodes(directory), actual => actual === denied).then(() => { firstSettled = true; });
  const second = readOwnedSolanaSocketInodes(directory);
  await turn();
  assert.deepEqual(state.enumerations, [directory, directory]); assert.equal(state.calls.length, 32);
  assert.equal(state.active, 32); // Each independent inspection has its own fixed pool.
  for (const call of state.calls.slice(16).reverse()) call.finish(`socket:[${2000 + Number(call.name)}]`);
  const secondInodes = await second;
  assert.deepEqual(secondInodes, new Set(names.map(name => String(2000 + Number(name)))));
  assert.equal(firstSettled, false); assert.equal(state.active, 16);
  for (const call of state.calls.slice(0, 16).reverse()) call.finish(call.name === '0' ? denied : `socket:[${1000 + Number(call.name)}]`);
  await first; assert.equal(state.active, 0);
  const third = readOwnedSolanaSocketInodes(directory); await turn();
  for (const call of state.calls.slice(32).reverse()) call.finish(`socket:[${3000 + Number(call.name)}]`);
  const thirdInodes = await third;
  assert.deepEqual(thirdInodes, new Set(names.map(name => String(3000 + Number(name)))));
  assert.notEqual(thirdInodes, secondInodes); assert.equal(state.enumerations.length, 3);
  for (const name of names) assert.equal(state.calls.filter(call => call.name === name).length, 3);
});
