/** Locations only. Reading a path does not validate or grant authority to an
 * artifact, process or account. Their existing validators remain responsible. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @param {string | URL} url */
function repository(url) {
  let directory = dirname(fileURLToPath(url));
  while (directory !== parse(directory).root) {
    const manifest = join(directory, 'package.json');
    if (existsSync(join(directory, 'scripts/layout.json')) && existsSync(manifest)
        && JSON.parse(readFileSync(manifest, 'utf8')).name === 'lianum') return directory;
    directory = dirname(directory);
  }
  throw new Error('LIANUM_PROJECT_ROOT_REQUIRED');
}

export const projectRoot = repository(import.meta.url);
const compatibilityRoot = join(projectRoot, '.internal/runtime');
const dataRoots = Object.freeze({
  engine: 'omnichain-product',
  protocol: 'golden-overlay-v17',
  wallet: 'omnichain-flat-profile/flat-wallet',
  crypto: 'omnichain-flat-profile/candidate-poseidon',
  components: 'omnichain-flat-profile',
});

/** @param {keyof typeof dataRoots} family */
export function legacyDataRoot(family) {
  if (!Object.hasOwn(dataRoots, family)) throw new Error('LIANUM_RESOURCE_FAMILY');
  return join(compatibilityRoot, dataRoots[family]);
}

/** @param {string} path */
export function sourcePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)
      || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('LIANUM_SOURCE_RELATIVE_PATH');
  }
  return join(projectRoot, path);
}

/** @param {string} path */
export const sourceURL = path => pathToFileURL(sourcePath(path));

/** @param {string | URL} url */
export function isCompatibilityModule(url) {
  const path = relative(compatibilityRoot, fileURLToPath(url));
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

/** An explicit source location plus the former location for historical runs.
 * No filesystem probing or fallback to stale generated code is performed.
 * @param {string | URL} url
 * @param {string} sourceRelative
 * @param {string} legacyRelative */
export function moduleResource(url, sourceRelative, legacyRelative) {
  const source = sourceURL(sourceRelative);
  return isCompatibilityModule(url) ? new URL(legacyRelative, url) : source;
}
