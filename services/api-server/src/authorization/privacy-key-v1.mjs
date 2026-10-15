/** Infrastructure-only secret, independent of mobile root/PoP/note keys.
 * The same secret must accompany a restore of the intake database. */
import { readFileSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
export function readPlatformPrivacyKeyV1(environment = process.env) {
  const direct = environment.LIANUM_PLATFORM_PRIVACY_KEY;
  const file = environment.LIANUM_PLATFORM_PRIVACY_KEY_FILE;
  if (Boolean(direct) === Boolean(file)) throw Error('PLATFORM_PRIVACY_KEY_CONFIGURATION');
  let key = direct;
  if (file) {
    let descriptor, bytes;
    try {
      descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(descriptor), path = lstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || realpathSync(file) !== file || stat.size !== 65
        || path.dev !== stat.dev || path.ino !== stat.ino) throw Error('PLATFORM_PRIVACY_KEY_FILE_INVALID');
      bytes = readFileSync(descriptor); key = bytes.toString('utf8');
      const after = fstatSync(descriptor), afterPath = lstatSync(file);
      if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
        || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
        || afterPath.dev !== stat.dev || afterPath.ino !== stat.ino || !/^[0-9a-f]{64}\n$/.test(key))
        throw Error('PLATFORM_PRIVACY_KEY_FILE_INVALID');
      key = key.slice(0, -1);
    } finally { bytes?.fill(0); if (descriptor !== undefined) closeSync(descriptor); }
  }
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) throw Error('PLATFORM_PRIVACY_KEY_CONFIGURATION');
  return key;
}
