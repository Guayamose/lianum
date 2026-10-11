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

// Exact active implementation identity for fixed source-pin collectors.
export const ENVIRONMENT_MODULE_URL = import.meta.url;
export const projectRoot = repository(import.meta.url);
const compatibilityRoot = join(projectRoot, '.internal/runtime');
const dataRoots = Object.freeze({
  engine: 'omnichain-product',
  protocol: 'golden-overlay-v17',
  wallet: 'omnichain-flat-profile/flat-wallet',
  crypto: 'omnichain-flat-profile/candidate-poseidon',
  components: 'omnichain-flat-profile',
});

/** @param {unknown} path @param {string} error @returns {string} */
function relativePath(path, error) {
  if (typeof path !== 'string' || !path || isAbsolute(path)
      || path.includes('\\') || path.includes('\0')
      || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(error);
  }
  return path;
}

// A source bundle carries its locations with it. Workers deliberately sanitize
// their environment, so locations must not depend on inherited environment
// variables. There is no fallback to the developer's historical runtime when
// an explicit candidate descriptor is present.
const locationsPath = join(projectRoot, 'runtime-resources.json');
const explicitLocations = existsSync(locationsPath);
/** @type {unknown} */
const locations = explicitLocations ? JSON.parse(readFileSync(locationsPath, 'utf8')) : null;
/** @type {string | null} */
let candidateResourcesRoot = null;
if (explicitLocations) {
  if (!locations || typeof locations !== 'object'
      || !('schema' in locations) || locations.schema !== 'LIANUM_RUNTIME_RESOURCES_V1'
      || !('status' in locations) || locations.status !== 'candidate'
      || !('financialAcceptance' in locations) || locations.financialAcceptance !== false
      || !('root' in locations)) throw new Error('LIANUM_RESOURCE_DESCRIPTOR');
  candidateResourcesRoot = relativePath(locations.root, 'LIANUM_RESOURCE_ROOT');
}
export const externalResourcesRoot = candidateResourcesRoot
  ? join(projectRoot, candidateResourcesRoot) : compatibilityRoot;
export const resourceMode = explicitLocations ? 'candidate' : 'historical-local';

/** Resource locations do not establish source, custody, proof or release
 * acceptance. Each consumer must retain its existing pin/identity checks.
 * @param {keyof typeof dataRoots} family */
export function resourceRoot(family) {
  if (!Object.hasOwn(dataRoots, family)) throw new Error('LIANUM_RESOURCE_FAMILY');
  return join(externalResourcesRoot, dataRoots[family]);
}

/** @param {keyof typeof dataRoots} family @param {string} path */
export function resourcePath(family, path) {
  return join(resourceRoot(family), relativePath(path, 'LIANUM_RESOURCE_RELATIVE_PATH'));
}

/** @param {keyof typeof dataRoots} family */
export function legacyDataRoot(family) {
  return resourceRoot(family);
}

/** @param {string} path */
export function sourcePath(path) {
  return join(projectRoot, relativePath(path, 'LIANUM_SOURCE_RELATIVE_PATH'));
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
