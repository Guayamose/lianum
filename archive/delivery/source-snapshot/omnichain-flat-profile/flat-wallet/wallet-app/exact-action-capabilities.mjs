/** Private listener-local attenuation, never a wallet authority or durable log.
 * Only server.mjs holds this registry. No issuance/status HTTP route exists. */
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { ALL_ACTIONS, buildActionBody } from './public/view-model.mjs';

export const EXACT_ACTION_MAX_ISSUANCES = 64;
export const EXACT_ACTION_DEFAULT_TTL_MS = 60_000;
export const EXACT_ACTION_MAX_TTL_MS = 300_000;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (value, code) => { if (!value) fail(code); };

function canonical(action, input) {
  const invalid = 'WALLET_ACTION_CAPABILITY_INVALID';
  need(typeof action === 'string' && Object.hasOwn(ALL_ACTIONS, action), invalid);
  need(input && typeof input === 'object' && !types.isProxy(input)
    && Object.getPrototypeOf(input) === Object.prototype, invalid);
  // Harden the bootstrap data boundary before using the shared browser/body
  // validator. Do not invoke getters, proxies, inherited fields or toJSON.
  const data = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    need(typeof key === 'string' && descriptor.enumerable
      && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string', invalid);
    data[key] = descriptor.value;
  }
  try { return JSON.stringify(Object.assign(Object.create(null), buildActionBody(action, data))); }
  catch { fail(invalid); }
}

/** Validate and snapshot before the server examines private target binding. */
export function exactActionCapabilityBody(action, input) { return Object.freeze(JSON.parse(canonical(action, input))); }

export function createExactActionCapabilities() {
  // Registry identity binds each token to this exact original listener. Target
  // identity additionally binds it to the already-fixed original session/service.
  const tokens = new Map(), issuedTokens = new Set();
  let closed = false;
  return Object.freeze({
    issue(action, body, ttlMs, target) {
      need(!closed && target, 'WALLET_ACTION_CAPABILITY_UNAVAILABLE');
      const canonicalBody = canonical(action, body);
      need(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= EXACT_ACTION_MAX_TTL_MS,
        'WALLET_ACTION_CAPABILITY_TTL');
      need(issuedTokens.size < EXACT_ACTION_MAX_ISSUANCES, 'WALLET_ACTION_CAPABILITY_LIMIT');
      const deadline = performance.now() + ttlMs;
      let token;
      do { token = randomBytes(32).toString('hex'); } while (issuedTokens.has(token));
      issuedTokens.add(token);
      tokens.set(token, { action, canonicalBody, target, deadline });
      return token;
    },
    recognizes(token) { return !closed && typeof token === 'string' && tokens.has(token); },
    consume(token, route, input, target) {
      const denied = 'WALLET_ACTION_ACCESS_REQUIRED';
      const entry = !closed && typeof token === 'string' && tokens.get(token);
      need(entry, denied);
      if (performance.now() >= entry.deadline) { tokens.delete(token); fail(denied); }
      need(entry.target === target && ALL_ACTIONS[entry.action].route === route, denied);
      let body;
      try { body = canonical(entry.action, input); } catch { fail(denied); }
      need(body === entry.canonicalBody, denied);
      if (performance.now() >= entry.deadline) { tokens.delete(token); fail(denied); }
      // Synchronous, irreversible local consumption BEFORE activity/admission
      // awaits. A later error, disconnect, expiry or close cannot restore it.
      tokens.delete(token);
    },
    isLive(token) { const entry = !closed && tokens.get(token); return Boolean(entry && performance.now() < entry.deadline); },
    revoke(token) { tokens.delete(token); },
    close() { closed = true; tokens.clear(); issuedTokens.clear(); },
  });
}
