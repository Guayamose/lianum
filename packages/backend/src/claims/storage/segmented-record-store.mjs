/** V3 encrypted, structurally segmented local record store.
 * Trusted, exclusively controlled local directory and OS; cooperative writers.
 * This is storage recovery, never evidence of an external custody action.
 * V2 files are neither read nor silently migrated. See segmented-record-store.md.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { types } from 'node:util';

const FORMAT = 'LIANUM_CLAIM_RECORD_STORE_V3';
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1 });
export const CLAIM_RECORD_STORE_LIMITS = Object.freeze({
  objectPlaintextBytes: 1024 * 1024,
  envelopeBytes: 2 * 1024 * 1024,
  logicalBytes: 32 * 1024 * 1024,
  logicalNodes: 500_000,
  depth: 64,
  retainedObjects: 100_000,
  retainedCommits: 4096,
  retainedRootEntries: 64,
  retainedFileBytes: 512 * 1024 * 1024,
});
const LIMIT = CLAIM_RECORD_STORE_LIMITS;
const LEAF_BYTES = 128 * 1024, PAGE_ITEMS = 512;
const HEX = /^[0-9a-f]{64}$/, COMMIT_NAME = /^([0-9]{10})\.json$/;
const hex = value => typeof value === 'string' && value.length === 64 && HEX.test(value);
const TEMP_NAME = /\.tmp-[0-9a-f]{32}$/;
const fail = (code, message) => Object.assign(new Error(message), { code });
const check = (condition, code) => { if (!condition) throw fail(code, code); };

/** The same restricted JSON semantics as the golden canonical() implementation,
 * with a separate explicit whole-record bound. An individual encrypted object
 * still uses the original 1 MiB / 100k-node limit. Never calls getters/toJSON. */
function canonicalJson(value, maximum = LIMIT.logicalBytes, maxNodes = LIMIT.logicalNodes) {
  const ancestors = new Set(); let nodes = 0, bytes = 0;
  const account = text => {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > maximum) throw new RangeError('CLAIM_STORE_JSON_BYTE_LIMIT');
    return text;
  };
  const string = value => {
    if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value, 'utf8') > LIMIT.objectPlaintextBytes)
      throw new TypeError('CLAIM_STORE_JSON_STRING');
    return JSON.stringify(value);
  };
  const visit = (item, depth) => {
    if (++nodes > maxNodes || depth > LIMIT.depth) throw new RangeError('CLAIM_STORE_JSON_COMPLEXITY_LIMIT');
    if (item === null) return account('null');
    if (typeof item === 'boolean') return account(String(item));
    if (typeof item === 'string') return account(string(item));
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || Object.is(item, -0)) throw new TypeError('CLAIM_STORE_JSON_INTEGER');
      return account(String(item));
    }
    if (typeof item !== 'object' || types.isProxy(item)) throw new TypeError('CLAIM_STORE_JSON_VALUE');
    if (ancestors.has(item)) throw new TypeError('CLAIM_STORE_JSON_CYCLE');
    ancestors.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
      if (keys.some(key => typeof key !== 'string')) throw new TypeError('CLAIM_STORE_JSON_SYMBOL');
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > maxNodes || keys.length !== item.length + 1)
          throw new TypeError('CLAIM_STORE_JSON_ARRAY');
        account('[]'); const parts = [];
        for (let index = 0; index < item.length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError('CLAIM_STORE_JSON_ARRAY_ELEMENT');
          if (index) account(',');
          parts.push(visit(descriptor.value, depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new TypeError('CLAIM_STORE_JSON_OBJECT');
      account('{}'); const parts = [];
      for (const key of keys.sort()) {
        const descriptor = descriptors[key], quoted = string(key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('CLAIM_STORE_JSON_PROPERTY');
        if (parts.length) account(',');
        account(`${quoted}:`); parts.push(`${quoted}:${visit(descriptor.value, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    } finally { ancestors.delete(item); }
  };
  return { text: visit(value, 0), bytes, nodes };
}
const canonicalObject = value => canonicalJson(value, LIMIT.objectPlaintextBytes, 100_000).text;
function exact(value, fields, label) {
  check(value && typeof value === 'object' && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), `CLAIM_STORE_${label}`);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  check(keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)
    && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value')), `CLAIM_STORE_${label}_FIELDS`);
}
function options(input) {
  exact(input, ['path', 'password', 'identity'], 'INPUT');
  check(typeof input.path === 'string' && input.path.length > 0 && !input.path.includes('\0'), 'CLAIM_STORE_PATH');
  check(typeof input.password === 'string' && input.password.isWellFormed()
    && Buffer.byteLength(input.password) >= 1 && Buffer.byteLength(input.password) <= 1024, 'CLAIM_STORE_PASSWORD');
  return { path: resolve(input.path), password: input.password, identity: canonicalJson(input.identity, 64 * 1024, 4096).text };
}
async function directory(path) {
  const stat = await lstat(path);
  check(stat.isDirectory() && !stat.isSymbolicLink(), 'CLAIM_STORE_UNSAFE_DIRECTORY');
}
async function boundedRead(path, maximum = LIMIT.envelopeBytes) {
  const metadata = await lstat(path);
  check(metadata.isFile() && !metadata.isSymbolicLink(), 'CLAIM_STORE_UNSAFE_FILE');
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    check(stat.isFile() && stat.size <= maximum, 'CLAIM_STORE_FILE_SIZE');
    // FD size selects allocation only, never the trusted read limit or EOF.
    // Tiny encrypted cells need not allocate/wipe the whole 2 MiB envelope
    // bound. A concurrent grow still reads/probes through the original max+1.
    let buffer = Buffer.alloc(Math.min(maximum + 1, Math.max(4096, stat.size + 1))), offset = 0;
    try {
      while (offset < maximum + 1) {
        if (offset === buffer.length) {
          const larger = Buffer.alloc(Math.min(maximum + 1, buffer.length * 2));
          try { buffer.copy(larger, 0, 0, offset); }
          catch (error) { larger.fill(0); throw error; }
          buffer.fill(0); buffer = larger;
        }
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      check(offset <= maximum, 'CLAIM_STORE_FILE_SIZE');
      return buffer.subarray(0, offset).toString('utf8');
    } finally { buffer.fill(0); }
  } finally { await handle.close(); }
}
async function syncDirectory(path) {
  if (process.platform === 'win32') return; // Same explicit platform limit as Vault.
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function optionalRead(path, maximum) {
  try { return await boundedRead(path, maximum); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function locked(path, work) {
  const lockPath = `${path}.lock`, token = randomBytes(32).toString('hex'); let handle, initialized = false;
  try { handle = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw fail('VAULT_LOCKED', 'Store is locked; stale locks need explicit recovery'); throw error; }
  try {
    await handle.writeFile(JSON.stringify({ version: 3, pid: process.pid, token }));
    await handle.sync(); initialized = true; await handle.close(); handle = undefined;
    return await work();
  } finally {
    await handle?.close();
    if (initialized) {
      const current = JSON.parse(await boundedRead(lockPath, 1024));
      check(current.token === token, 'CLAIM_STORE_LOCK_OWNERSHIP');
    }
    await unlink(lockPath);
  }
}
function validateHeader(header) {
  exact(header, ['format', 'store', 'kdf'], 'HEADER'); exact(header.kdf, ['name', 'N', 'r', 'p', 'salt'], 'KDF');
  check(header.format === FORMAT && hex(header.store) && hex(header.kdf.salt)
    && header.kdf.name === KDF.name && header.kdf.N === KDF.N && header.kdf.r === KDF.r && header.kdf.p === KDF.p, 'CLAIM_STORE_HEADER_PARAMETERS');
}
const revisionName = revision => `${String(revision).padStart(10, '0')}.json`;

// Fresh independent filesystem reads only, inside one original locked scan.
// All eight workers drain before an error escapes; results retain input order.
// No read cache persists across calls and no writes enter this queue.
async function freshScanReads(items, work) {
  const results = new Array(items.length); let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++; if (index >= items.length) return;
      try { results[index] = { ok: true, value: await work(items[index], index) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return results; // The original consumer validates/errors in original item order.
}


async function sessionFactory(input, initial, creating, readOnly = false) {
  const selected = options(input);
  // Capture caller-owned data before the first asynchronous boundary.
  let initialSnapshot = creating ? canonicalJson(initial) : undefined;
  input = undefined; initial = undefined;
  const path = selected.path, objectPath = join(path, 'objects'), commitPath = join(path, 'commits');
  let key, contentKey, header, headerText, busy = false, closed = false, poisoned = false, writing = false;
  let checkpoint, recovered = false, openedRevision = 0, durableAckAtOpen = -1;
  const live = () => check(!closed && !poisoned && key && contentKey, 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  const wipe = () => { key?.fill(0); contentKey?.fill(0); key = undefined; contentKey = undefined; };
  const identify = (domain, text) => createHmac('sha256', contentKey)
    .update(`${FORMAT}/${domain}\0`).update(selected.identity).update('\0').update(text).digest('hex');
  function derive() {
    const master = scryptSync(selected.password, Buffer.from(header.kdf.salt, 'hex'), 32,
      { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
    selected.password = undefined;
    try {
      key = createHmac('sha256', master).update(`${FORMAT}/aes-256-gcm`).digest();
      contentKey = createHmac('sha256', master).update(`${FORMAT}/private-content-id`).digest();
    } finally { master.fill(0); }
  }
  function aad(envelope) {
    return Buffer.from(canonicalObject({ header, identity: selected.identity, kind: envelope.kind, id: envelope.id, iv: envelope.iv }));
  }
  function encrypt(kind, id, value) {
    live(); const plaintext = Buffer.from(canonicalObject(value));
    try {
      const envelope = { format: FORMAT, store: header.store, kind, id, iv: randomBytes(12).toString('hex'), tag: '', ciphertext: '' };
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'), { authTagLength: 16 });
      cipher.setAAD(aad(envelope)); envelope.ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64url');
      envelope.tag = cipher.getAuthTag().toString('hex'); return JSON.stringify(envelope);
    } finally { plaintext.fill(0); }
  }
  function decrypt(serialized, kind, id) {
    live(); const envelope = JSON.parse(serialized);
    exact(envelope, ['format', 'store', 'kind', 'id', 'iv', 'tag', 'ciphertext'], 'ENVELOPE');
    check(envelope.format === FORMAT && envelope.store === header.store && envelope.kind === kind && envelope.id === id, 'CLAIM_STORE_ENVELOPE_DOMAIN');
    check(typeof envelope.iv === 'string' && envelope.iv.length === 24 && /^[0-9a-f]{24}$/.test(envelope.iv)
      && typeof envelope.tag === 'string' && envelope.tag.length === 32 && /^[0-9a-f]{32}$/.test(envelope.tag), 'CLAIM_STORE_CIPHER_HEADER');
    check(typeof envelope.ciphertext === 'string' && envelope.ciphertext.length >= 2
      && envelope.ciphertext.length <= Math.ceil(LIMIT.objectPlaintextBytes * 4 / 3)
      && /^[A-Za-z0-9_-]+$/.test(envelope.ciphertext), 'CLAIM_STORE_CIPHERTEXT');
    const bytes = Buffer.from(envelope.ciphertext, 'base64url'); let partial, plaintext;
    check(bytes.length <= LIMIT.objectPlaintextBytes && bytes.toString('base64url') === envelope.ciphertext, 'CLAIM_STORE_CIPHERTEXT_CANONICAL');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'), { authTagLength: 16 });
      decipher.setAAD(aad(envelope)); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      try { partial = decipher.update(bytes); plaintext = Buffer.concat([partial, decipher.final()]); }
      catch { throw fail('CLAIM_STORE_AUTHENTICATION', 'Encrypted store authentication failed'); }
      const text = plaintext.toString('utf8'), value = JSON.parse(text);
      check(canonicalObject(value) === text, 'CLAIM_STORE_NONCANONICAL_PLAINTEXT'); return value;
    } finally { partial?.fill(0); plaintext?.fill(0); }
  }
  async function atomicWrite(target, serialized) {
    writing = true;
    const temporary = `${target}.tmp-${randomBytes(16).toString('hex')}`; let handle, created = false;
    try {
      handle = await open(temporary, 'wx', 0o600); created = true;
      await handle.writeFile(serialized, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
      await rename(temporary, target); created = false; await syncDirectory(dirname(target));
      check(await boundedRead(target) === serialized, 'CLAIM_STORE_WRITE_READBACK');
    } finally {
      try { await handle?.close(); }
      finally {
        if (created) try { await unlink(temporary); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  async function writeEncrypted(target, kind, id, value) {
    await atomicWrite(target, encrypt(kind, id, value));
    check(canonicalObject(decrypt(await boundedRead(target), kind, id)) === canonicalObject(value), 'CLAIM_STORE_AUTHENTICATED_READBACK');
  }
  function objectLinks(node) {
    if (node.kind === 'value') { exact(node, ['kind', 'value'], 'VALUE_NODE'); return []; }
    if (node.kind === 'array') {
      exact(node, ['kind', 'items'], 'ARRAY_NODE');
      check(Array.isArray(node.items) && node.items.length <= PAGE_ITEMS && node.items.every(hex), 'CLAIM_STORE_ARRAY_LINKS');
      return node.items;
    }
    if (node.kind === 'object') {
      exact(node, ['kind', 'entries'], 'OBJECT_NODE');
      check(Array.isArray(node.entries) && node.entries.length <= PAGE_ITEMS, 'CLAIM_STORE_OBJECT_ENTRIES');
      let previous;
      for (const entry of node.entries) {
        check(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
          && hex(entry[1]) && (previous === undefined || previous < entry[0]), 'CLAIM_STORE_OBJECT_LINKS');
        previous = entry[0];
      }
      return node.entries.map(entry => entry[1]);
    }
    check(node.kind === 'array-pages' || node.kind === 'object-pages', 'CLAIM_STORE_NODE_KIND');
    exact(node, ['kind', 'pages'], 'PAGE_NODE');
    check(Array.isArray(node.pages) && node.pages.length >= 1 && node.pages.length <= PAGE_ITEMS
      && node.pages.every(hex), 'CLAIM_STORE_PAGE_LINKS');
    return node.pages;
  }
  function buildObjects(data) {
    const pending = new Map();
    const put = node => {
      const text = canonicalObject(node), id = identify('object', text);
      if (!pending.has(id)) pending.set(id, text);
      check(pending.size <= LIMIT.retainedObjects, 'CLAIM_STORE_OBJECT_COUNT'); return id;
    };
    const pages = (kind, entries) => {
      const field = kind === 'array' ? 'items' : 'entries';
      let ids = [];
      for (let start = 0; start < entries.length; start += PAGE_ITEMS) ids.push(put({ kind, [field]: entries.slice(start, start + PAGE_ITEMS) }));
      if (!ids.length) return put({ kind, [field]: [] });
      while (ids.length > 1) {
        const next = [];
        for (let start = 0; start < ids.length; start += PAGE_ITEMS) next.push(put({ kind: `${kind}-pages`, pages: ids.slice(start, start + PAGE_ITEMS) }));
        ids = next;
      }
      return ids[0];
    };
    const pack = (value, level) => {
      const container = value !== null && typeof value === 'object';
      if (!container) return put({ kind: 'value', value });
      if (level > 1) {
        try {
          const text = canonicalObject({ kind: 'value', value });
          if (Buffer.byteLength(text) <= LEAF_BYTES) return put({ kind: 'value', value });
        } catch (error) { if (!(error instanceof RangeError)) throw error; }
      }
      if (Array.isArray(value)) return pages('array', value.map(item => pack(item, level + 1)));
      return pages('object', Object.keys(value).sort().map(name => [name, pack(value[name], level + 1)]));
    };
    return { root: pack(data, 0), pending };
  }
  async function listLayout() {
    await directory(path); await directory(objectPath); await directory(commitPath);
    check(await boundedRead(join(path, 'header.json'), 4096) === headerText, 'CLAIM_STORE_HEADER_CHANGED');
    const rootNames = await readdir(path);
    check(rootNames.length <= LIMIT.retainedRootEntries, 'CLAIM_STORE_ROOT_COUNT');
    check(rootNames.every(name => ['header.json', 'objects', 'commits', 'HEAD', 'ACK'].includes(name) || TEMP_NAME.test(name)), 'CLAIM_STORE_UNKNOWN_ROOT_FILE');
    const objects = await readdir(objectPath), commits = await readdir(commitPath);
    check(objects.length <= LIMIT.retainedObjects && commits.length <= LIMIT.retainedCommits, 'CLAIM_STORE_RETAINED_COUNT');
    check(objects.every(name => /^[0-9a-f]{64}\.json$/.test(name) || TEMP_NAME.test(name)), 'CLAIM_STORE_UNKNOWN_OBJECT_FILE');
    check(commits.every(name => COMMIT_NAME.test(name) || TEMP_NAME.test(name)), 'CLAIM_STORE_UNKNOWN_COMMIT_FILE');
    const files = [[path, rootNames.filter(name => !['objects', 'commits'].includes(name))], [objectPath, objects], [commitPath, commits]]
      .flatMap(([base, names]) => names.map(name => join(base, name)));
    const metadata = await freshScanReads(files, file => lstat(file));
    let retainedBytes = 0;
    for (const item of metadata) {
      if (!item.ok) throw item.error;
      const stat = item.value;
      check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= LIMIT.envelopeBytes, 'CLAIM_STORE_UNSAFE_RETAINED_FILE');
      retainedBytes += stat.size;
      check(retainedBytes <= LIMIT.retainedFileBytes, 'CLAIM_STORE_RETAINED_BYTES');
    }
    return { objects: objects.filter(name => !TEMP_NAME.test(name)), commits: commits.filter(name => !TEMP_NAME.test(name)).sort(),
      objectEntries: objects.length, commitEntries: commits.length, rootEntries: rootNames.length, retainedBytes };
  }
  async function scan(fullHistory = false) {
    const layout = await listLayout();
    check(layout.commits.length >= 1, 'CLAIM_STORE_NO_COMMITTED_STATE');
    const nodes = new Map();
    // Only graph metadata lives for this call. Full reopen audits authenticate
    // retained history and orphans; ordinary reads visit the current root only.
    const objectNames = new Set(layout.objects);
    // Ciphertext only from the original physical layout or an authenticated
    // parent's links. One global eight-envelope reservation follows the DFS;
    // neither authentication nor graph validation enters the read queue.
    const verificationMaximum = Math.min(LIMIT.logicalBytes, 8 * (LIMIT.envelopeBytes + 1));
    const verificationCiphertexts = new Map();
    const releaseVerification = id => {
      const outcome = verificationCiphertexts.get(id);
      if (outcome) outcome.value = undefined;
      verificationCiphertexts.delete(id);
    };
    const readVerifiedPaths = async (ids, consume) => {
      for (let start = 0; start < ids.length;) {
        const available = Math.floor(verificationMaximum / (LIMIT.envelopeBytes + 1)) - verificationCiphertexts.size;
        const admitted = [], selected = new Set(); let end = start;
        while (end < ids.length && end - start < 8) {
          const id = ids[end];
          const needed = !nodes.has(id) && !verificationCiphertexts.has(id)
            && !selected.has(id) && objectNames.has(`${id}.json`);
          if (needed && admitted.length === available) break;
          if (needed) { admitted.push(id); selected.add(id); }
          end++;
        }
        check(end > start, 'CLAIM_STORE_RECONSTRUCTION_LIMIT');
        // Reserve every complete trusted envelope maximum before any IO.
        for (const id of admitted) verificationCiphertexts.set(id, null);
        try {
          const outcomes = await freshScanReads(admitted, id => boundedRead(join(objectPath, `${id}.json`)));
          for (let index = 0; index < admitted.length; index++) verificationCiphertexts.set(admitted[index], outcomes[index]);
          for (let index = start; index < end; index++) await consume(ids[index]);
        } finally { for (const id of admitted) releaseVerification(id); }
        start = end;
      }
    };
    const loadNode = async id => {
      check(objectNames.has(`${id}.json`), 'CLAIM_STORE_MISSING_OR_CYCLIC_OBJECT');
      const ciphertext = verificationCiphertexts.get(id); let node;
      try {
        if (ciphertext && !ciphertext.ok) throw ciphertext.error;
        node = decrypt(ciphertext ? ciphertext.value : await boundedRead(join(objectPath, `${id}.json`)), 'object', id);
      } finally { if (ciphertext) releaseVerification(id); }
      check(identify('object', canonicalObject(node)) === id, 'CLAIM_STORE_OBJECT_CONTENT_ID');
      nodes.set(id, { kind: node.kind, links: objectLinks(node) });
      return node;
    };
    if (fullHistory) await readVerifiedPaths(layout.objects.map(name => name.slice(0, -5)), loadNode);
    // Fresh commit reads/authentication drain first. Every name, read error,
    // schema, predecessor and content ID is consumed in original revision order.
    const authenticated = await freshScanReads(layout.commits, async (name, revision) =>
      decrypt(await boundedRead(join(commitPath, name)), 'commit', String(revision)));
    let previous = null, current;
    const chain = [];
    for (let revision = 0; revision < authenticated.length; revision++) {
      check(layout.commits[revision] === revisionName(revision), 'CLAIM_STORE_COMMIT_GAP');
      const item = authenticated[revision]; if (!item.ok) throw item.error;
      const value = item.value;
      exact(value, ['revision', 'previous', 'root', 'commitment', 'logicalBytes', 'logicalNodes'], 'COMMIT');
      check(value.revision === revision && value.previous === previous && hex(value.root) && hex(value.commitment)
        && Number.isSafeInteger(value.logicalBytes) && value.logicalBytes > 0 && value.logicalBytes <= LIMIT.logicalBytes
        && Number.isSafeInteger(value.logicalNodes) && value.logicalNodes > 0 && value.logicalNodes <= LIMIT.logicalNodes, 'CLAIM_STORE_COMMIT_CHAIN');
      const id = identify('commit', canonicalObject(value));
      chain.push({ ...value, id }); current = chain.at(-1); previous = id;
    }
    // Authenticate every retained historical root's closure, with cycles and
    // absent objects rejected. No historical state can silently lose a body.
    const visited = new Set(), visiting = new Set();
    const walk = async (id, depth) => {
      check(depth <= LIMIT.depth * 2, 'CLAIM_STORE_GRAPH_DEPTH');
      if (visited.has(id)) return;
      check(!visiting.has(id), 'CLAIM_STORE_MISSING_OR_CYCLIC_OBJECT');
      if (!nodes.has(id)) await loadNode(id);
      visiting.add(id);
      await readVerifiedPaths(nodes.get(id).links, link => walk(link, depth + 1));
      visiting.delete(id); visited.add(id);
    };
    for (const commit of fullHistory ? chain : [current]) await walk(commit.root, 0);
    if (checkpoint) check(chain[checkpoint.revision]?.id === checkpoint.id, 'CLAIM_STORE_ROLLBACK_OR_REPLACEMENT');
    const marker = async kind => {
      const serialized = await optionalRead(join(path, kind));
      if (serialized === undefined) return { revision: -1, commit: null };
      const value = decrypt(serialized, kind.toLowerCase(), kind);
      exact(value, ['revision', 'commit'], 'MARKER');
      check(Number.isSafeInteger(value.revision) && value.revision >= 0 && value.revision < chain.length
        && value.commit === chain[value.revision].id, 'CLAIM_STORE_MARKER_CHAIN'); return value;
    };
    const head = await marker('HEAD'), ack = await marker('ACK');
    check(ack.revision <= head.revision && head.revision <= current.revision
      && current.revision - ack.revision <= 1, 'CLAIM_STORE_AMBIGUOUS_MARKERS');
    // Missing markers are valid only for an interrupted first commit.
    check((head.revision >= 0 && ack.revision >= 0) || current.revision === 0, 'CLAIM_STORE_MISSING_MARKER');
    const budget = { visits: 0, contentBytes: 0 };
    const content = bytes => {
      budget.contentBytes += bytes;
      check(budget.contentBytes <= LIMIT.logicalBytes, 'CLAIM_STORE_RECONSTRUCTION_BYTES');
    };
    // One fixed reservation budget across the entire DFS, not eight buffers
    // per depth. Every reserved ciphertext read retains the existing envelope
    // bound; all admitted reads drain before the original ordered consumer.
    const cipherReservationBytes = LIMIT.envelopeBytes + 1;
    const cipherBudget = Math.min(LIMIT.logicalBytes, 8 * cipherReservationBytes);
    let reservedCipherBytes = 0;
    const cipherReservations = new Set();
    const releaseCipher = outcome => {
      if (cipherReservations.delete(outcome)) {
        outcome.value = undefined; reservedCipherBytes -= cipherReservationBytes;
      }
    };
    const readChildren = async (links, consume) => {
      for (let start = 0; start < links.length;) {
        const width = Math.min(links.length - start, 8,
          Math.floor((cipherBudget - reservedCipherBytes) / cipherReservationBytes));
        check(width > 0, 'CLAIM_STORE_RECONSTRUCTION_LIMIT');
        // Reserve the complete trusted file maximum BEFORE any allocation/IO.
        reservedCipherBytes += width * cipherReservationBytes;
        let outcomes;
        try {
          outcomes = await freshScanReads(links.slice(start, start + width),
            link => boundedRead(join(objectPath, `${link}.json`)));
          for (const outcome of outcomes) cipherReservations.add(outcome);
          for (let index = 0; index < width; index++)
            await consume(links[start + index], outcomes[index], start + index);
        } finally {
          if (outcomes) for (const outcome of outcomes) releaseCipher(outcome);
          else reservedCipherBytes -= width * cipherReservationBytes;
        }
        start += width;
      }
    };
    const reconstruct = async (id, depth = 0, ciphertext = null) => {
      check(++budget.visits <= LIMIT.logicalNodes * 3 && depth <= LIMIT.depth * 2, 'CLAIM_STORE_RECONSTRUCTION_LIMIT');
      let node;
      try {
        if (ciphertext && !ciphertext.ok) throw ciphertext.error;
        node = decrypt(ciphertext ? ciphertext.value : await boundedRead(join(objectPath, `${id}.json`)), 'object', id);
      } finally { if (ciphertext) releaseCipher(ciphertext); }
      check(identify('object', canonicalObject(node)) === id, 'CLAIM_STORE_OBJECT_CONTENT_ID'); objectLinks(node);
      if (node.kind === 'value') { content(canonicalJson(node.value).bytes); return node.value; }
      if (node.kind === 'array') {
        const result = [];
        await readChildren(node.items, async (link, ciphertext) => {
          result.push(await reconstruct(link, depth + 1, ciphertext));
        });
        return result;
      }
      if (node.kind === 'object') {
        const result = Object.create(null);
        await readChildren(node.entries.map(entry => entry[1]), async (link, ciphertext, index) => {
          const name = node.entries[index][0];
          content(Buffer.byteLength(JSON.stringify(name)));
          result[name] = await reconstruct(link, depth + 1, ciphertext);
        });
        return result;
      }
      const result = node.kind === 'array-pages' ? [] : Object.create(null); let lastName;
      await readChildren(node.pages, async (link, ciphertext) => {
        const expected = node.kind === 'array-pages' ? ['array', 'array-pages'] : ['object', 'object-pages'];
        check(expected.includes(nodes.get(link)?.kind), 'CLAIM_STORE_PAGE_KIND');
        const page = await reconstruct(link, depth + 1, ciphertext);
        if (Array.isArray(result)) for (const item of page) result.push(item);
        else for (const name of Object.keys(page).sort()) {
          check(lastName === undefined || lastName < name, 'CLAIM_STORE_PAGE_ORDER');
          result[name] = page[name]; lastName = name;
        }
      });
      return result;
    };
    const data = await reconstruct(current.root), logical = canonicalJson(data);
    check(logical.bytes === current.logicalBytes && logical.nodes === current.logicalNodes
      && identify(`record/${current.revision}`, logical.text) === current.commitment, 'CLAIM_STORE_RECORD_COMMITMENT');
    return { current, head, ack, data: JSON.parse(logical.text), layout };
  }
  async function settle(current) {
    // Reserve space for marker temps and the initial missing marker files.
    const layout = await listLayout();
    check(layout.rootEntries + 2 <= LIMIT.retainedRootEntries, 'CLAIM_STORE_ROOT_COUNT');
    check(layout.retainedBytes + 8192 <= LIMIT.retainedFileBytes, 'CLAIM_STORE_RETAINED_BYTES');
    const marker = { revision: current.revision, commit: current.id };
    await writeEncrypted(join(path, 'HEAD'), 'head', 'HEAD', marker);
    await writeEncrypted(join(path, 'ACK'), 'ack', 'ACK', marker);
  }
  const result = scanned => ({ revision: scanned.current.revision, data: scanned.data, commitment: scanned.current.commitment });
  async function commit(revision, previous, snapshot, existing) {
    check(revision < LIMIT.retainedCommits, 'CLAIM_STORE_COMMIT_LIMIT');
    const data = JSON.parse(snapshot.text), graph = buildObjects(data);
    const names = new Set(existing?.objects ?? []);
    const fresh = [...graph.pending].filter(([id]) => !names.has(`${id}.json`));
    check((existing?.objectEntries ?? 0) + fresh.length <= LIMIT.retainedObjects, 'CLAIM_STORE_OBJECT_COUNT');
    check((existing?.commitEntries ?? 0) + 1 <= LIMIT.retainedCommits, 'CLAIM_STORE_COMMIT_LIMIT');
    check((existing?.rootEntries ?? 3) + 2 <= LIMIT.retainedRootEntries, 'CLAIM_STORE_ROOT_COUNT');
    // Bound retained ciphertext before mutation, including new manifests and
    // replaced HEAD/ACK. This conservatively overcounts their old versions.
    const envelopes = fresh.map(([id, text]) => [id, encrypt('object', id, JSON.parse(text))]);
    const value = { revision, previous, root: graph.root, commitment: identify(`record/${revision}`, snapshot.text), logicalBytes: snapshot.bytes, logicalNodes: snapshot.nodes };
    const id = identify('commit', canonicalObject(value)), current = { ...value, id };
    const serializedCommit = encrypt('commit', String(revision), value);
    const newBytes = envelopes.reduce((sum, [, text]) => sum + Buffer.byteLength(text), Buffer.byteLength(serializedCommit) + 8192);
    check((existing?.retainedBytes ?? 0) + newBytes <= LIMIT.retainedFileBytes, 'CLAIM_STORE_RETAINED_BYTES');
    for (const [objectId, serialized] of envelopes) {
      await atomicWrite(join(objectPath, `${objectId}.json`), serialized);
      const actual = decrypt(await boundedRead(join(objectPath, `${objectId}.json`)), 'object', objectId);
      check(identify('object', canonicalObject(actual)) === objectId, 'CLAIM_STORE_AUTHENTICATED_READBACK');
    }
    const destination = join(commitPath, revisionName(revision));
    check(await optionalRead(destination) === undefined, 'CLAIM_STORE_COMMIT_EXISTS');
    await atomicWrite(destination, serializedCommit);
    check(canonicalObject(decrypt(await boundedRead(destination), 'commit', String(revision))) === canonicalObject(value), 'CLAIM_STORE_AUTHENTICATED_READBACK');
    // A finalized commit is authoritative even if a later marker fsync fails.
    // Read the complete state before writing any storage acknowledgement.
    const scanned = await scan();
    check(scanned.current.id === id, 'CLAIM_STORE_COMMIT_READBACK');
    await settle(current);
    const acknowledged = await scan();
    check(acknowledged.current.id === id && acknowledged.ack.commit === id, 'CLAIM_STORE_ACK_READBACK');
    checkpoint = { revision, id }; return result(acknowledged);
  }
  async function run(work) {
    live(); check(!busy, 'CLAIM_STORE_BUSY'); busy = true; writing = false;
    try { return await locked(path, work); }
    catch (error) {
      if (writing || !['VAULT_LOCKED', 'VAULT_CONFLICT'].includes(error.code) && error.storeReadFailure) { poisoned = true; wipe(); }
      throw error;
    } finally { busy = false; writing = false; }
  }
  async function readState() {
    try {
      const scanned = await scan();
      check(scanned.ack.revision === scanned.current.revision, 'CLAIM_STORE_RECOVERY_REQUIRES_REOPEN');
      // Observation advances the live checkpoint even if CAS or the caller's
      // transform later rejects; observed newer state must not be forgotten.
      checkpoint = { revision: scanned.current.revision, id: scanned.current.id };
      return scanned;
    } catch (error) { error.storeReadFailure = true; throw error; }
  }
  try {
    await locked(path, async () => {
      if (creating) {
        try { await lstat(path); throw fail('VAULT_EXISTS', 'V3 store path already exists; explicit new path required'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        writing = true;
        await mkdir(path, { mode: 0o700 }); await syncDirectory(dirname(path));
        await mkdir(objectPath, { mode: 0o700 }); await mkdir(commitPath, { mode: 0o700 }); await syncDirectory(path);
        header = { format: FORMAT, store: randomBytes(32).toString('hex'), kdf: { ...KDF, salt: randomBytes(32).toString('hex') } };
        headerText = JSON.stringify(header); derive(); await atomicWrite(join(path, 'header.json'), headerText);
        await commit(0, null, initialSnapshot); initialSnapshot = undefined; durableAckAtOpen = 0;
      } else {
        await directory(path); headerText = await boundedRead(join(path, 'header.json'), 4096); header = JSON.parse(headerText); validateHeader(header); derive();
        const scanned = await scan(true); openedRevision = scanned.current.revision; durableAckAtOpen = scanned.ack.revision;
        recovered = scanned.ack.revision !== scanned.current.revision;
        if (recovered && readOnly) throw fail('CLAIM_STORE_OBSERVATION_UNACKNOWLEDGED', 'Read-only observation requires an acknowledged original commit');
        if (recovered) {
          await settle(scanned.current);
          const after = await scan(); check(after.current.id === scanned.current.id && after.ack.commit === scanned.current.id, 'CLAIM_STORE_RECOVERY_READBACK');
        }
        checkpoint = { revision: scanned.current.revision, id: scanned.current.id };
      }
    });
  } catch (error) { poisoned = true; wipe(); throw error; }
  writing = false;
  const session = Object.create(null);
  Object.defineProperties(session, {
    read: { value: () => run(async () => {
      const scanned = await readState();
      checkpoint = { revision: scanned.current.revision, id: scanned.current.id }; return result(scanned);
    }) },
    update: { value: (expectedRevision, transform) => run(async () => {
      check(!readOnly, 'CLAIM_STORE_OBSERVATION_ONLY');
      check(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 'CLAIM_STORE_EXPECTED_REVISION');
      if (typeof transform !== 'function' || types.isAsyncFunction(transform)) throw new TypeError('Store transform must be synchronous');
      const scanned = await readState();
      if (scanned.current.revision !== expectedRevision) throw fail('VAULT_CONFLICT', 'Store revision conflict');
      const next = transform(scanned.data);
      if (types.isPromise(next)) { next.catch(() => {}); throw new TypeError('Store transform must return synchronous JSON'); }
      const snapshot = canonicalJson(next);
      return commit(expectedRevision + 1, scanned.current.id, snapshot, scanned.layout);
    }) },
    recovery: { value: () => { live(); return Object.freeze({ format: FORMAT, openedFromDisk: !creating, openedRevision, durableAckAtOpen,
      recoveredUnacknowledgedCommit: recovered, requiresExternalEffectReconciliation: !creating, nativeNodeRestart: false }); } },
    close: { value: () => { check(!busy, 'CLAIM_STORE_BUSY'); closed = true; wipe(); } },
    toJSON: { value: () => { throw new Error('CLAIM_STORE_NOT_SERIALIZABLE'); } },
  });
  return Object.freeze(session);
}

export function createClaimRecordStore(input, initialData) { return sessionFactory(input, initialData, true); }
export function openClaimRecordStore(input) { return sessionFactory(input, undefined, false); }

// Observation never settles missing ACK markers or changes the retained record.
export function observeClaimRecordStoreV1(input) { return sessionFactory(input, undefined, false, true); }

/** Exact bounded logical-record encoding shared with authenticated storage.
 * Pure data only: rejects accessors, functions, proxies and non-JSON values. */
export function canonicalClaimRecordDataV1(value){assertCanonicalArity(arguments.length);return canonicalJson(value).text;}
function assertCanonicalArity(count){if(count!==1)throw new TypeError('CLAIM_STORE_CANONICAL_ARGUMENTS');}
