/** Durable mode-0600 JSON publication used by owned local lifetimes. */
import {randomBytes} from 'node:crypto';
import {openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
export const freshFixtureId = () => randomBytes(32).toString('hex');
export const fixtureJSON = value => JSON.stringify(value, (_key, child) => typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
export function writeFixturePrivate(file, value) {
  const temporary = file + '.' + freshFixtureId() + '.tmp';
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, fixtureJSON(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  const parent = openSync(dirname(file), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
