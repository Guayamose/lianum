/** Private, single-writer durable fiat metadata. Contains no merchant keys/KYC. */
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { needMoonPayV1, failMoonPayV1, exactMoonPayV1 } from './moonpay-codec-v1.mjs';
const MAX_BYTES = 16 * 1024 * 1024;
async function privateFile(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try {
    const stat = await handle.stat(); needMoonPayV1(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600 && stat.size <= MAX_BYTES, 'FIAT_STORE_UNSAFE');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function openMoonPayOrderStoreV1(directory, binding) {
  needMoonPayV1(typeof directory === 'string' && isAbsolute(directory), 'FIAT_STORE_UNSAFE');
  let fresh = false; await mkdir(directory, { mode: 0o700 }).then(() => { fresh = true; }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(directory); needMoonPayV1(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'FIAT_STORE_UNSAFE');
  const lockPath = join(directory, 'writer.lock'), statePath = join(directory, 'orders.json');
  let lock; try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.sync(); } catch { await lock?.close(); failMoonPayV1('FIAT_STORE_ALREADY_OPEN'); }
  const lockStat = await lock.stat(); let closing = false, poisoned = false, work = Promise.resolve(), closeWork;
  let state;
  async function save(next) {
    const encoded = JSON.stringify(next); needMoonPayV1(Buffer.byteLength(encoded) <= MAX_BYTES, 'FIAT_STORE_CAPACITY');
    const temporary = join(directory, 'next-' + randomUUID() + '.json'); let file, installed = false;
    try { file = await open(temporary, 'wx', 0o600); await file.writeFile(encoded); await file.sync(); await file.close(); file = null; await rename(temporary, statePath); installed = true; const folder = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY); try { await folder.sync(); } finally { await folder.close(); } }
    catch { if (installed) poisoned = true; failMoonPayV1('FIAT_STORE_WRITE_UNCERTAIN'); }
    finally { await file?.close(); if (!installed) await unlink(temporary).catch(() => {}); }
  }
  try {
    try { state = JSON.parse(await privateFile(statePath)); } catch (error) { if (error.code !== 'ENOENT') throw error; needMoonPayV1(fresh, 'FIAT_STORE_BINDING'); state = { profile: 'LIANUM_MOONPAY_ORDER_STORE_V1', binding, revision: 0, orders: [], webhooks: [] }; await save(state); }
    exactMoonPayV1(state, ['profile', 'binding', 'revision', 'orders', 'webhooks']);
    needMoonPayV1(state.profile === 'LIANUM_MOONPAY_ORDER_STORE_V1' && state.binding === binding && Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.orders) && state.orders.length <= 10000 && Array.isArray(state.webhooks) && state.webhooks.length <= 20000, 'FIAT_STORE_BINDING');
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  function serial(operation) {
    needMoonPayV1(!closing && !poisoned, 'FIAT_STORE_CLOSED');
    const own = work.then(operation); work = own.catch(() => {}); return own;
  }
  return Object.freeze({
    read: () => serial(() => structuredClone(state)),
    transaction: operation => serial(async () => { const next = structuredClone(state), result = await operation(next); next.revision = state.revision + 1; needMoonPayV1(Number.isSafeInteger(next.revision), 'FIAT_STORE_CAPACITY'); await save(next); state = next; return structuredClone(result); }),
    close() { if (closeWork) return closeWork; closing = true; return closeWork = work.then(async () => { await lock.close(); const actual = await lstat(lockPath); needMoonPayV1(actual.ino === lockStat.ino && actual.dev === lockStat.dev, 'FIAT_STORE_LOCK_CHANGED'); await unlink(lockPath); }); },
  });
}
