/** Mechanical platform transport for the original Paged protocol. Its authority comes from
 * the privately constructed account, not from a generic TOP_UP/EXIT signature.
 * The same adapter serves mobile and SDK callers and survives a cold reopen by
 * binding the freshly validated original account before accepting requests. */
import assert from 'node:assert/strict';
import { retainDevicePagedFailureMetadataV3 } from '../../operations/local/device-paged-failure-metadata-v3.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';

const routes = Object.freeze({
  '/v1/mobile/paged-owner/challenges': 'challenge',
  '/v1/mobile/paged-owner/operations': 'submit',
  '/v1/mobile/paged-owner/graph/pairing': 'pairing',
  '/v1/mobile/paged-owner/graph/challenges': 'graphChallenge',
  '/v1/mobile/paged-owner/graph/operations': 'graphSubmit',
});
const MAX_BODY = 4 * 1024 * 1024;
export const DEVICE_PAGED_PLATFORM_PROFILE_V3 = 'DEVICE_PAGED_PLATFORM_APPLICATION_V3';

export function createDevicePagedPlatformApplicationV3(context) {
  assert.equal(arguments.length, 1);
  // Mechanical HTTP/SDK boundary. The private operator binds original account
  // callbacks before listening; this helper creates no economic capability.
  P.pagedOwnerExactV3(context, ['descriptor', 'nativePreparation', 'dispatch', 'isLive']);
  const descriptor = P.normalizeDevicePagedDescriptorV3(context.descriptor);
  const nativePreparation = context.nativePreparation === null ? null
    : C.normalizeDevicePagedNativePreparationV3(context.nativePreparation, descriptor);
  const { dispatch, isLive } = context; assert.equal(typeof dispatch, 'function'); assert.equal(typeof isLive, 'function');
  let closed = false;
  const live = () => assert.ok(!closed && isLive() === true, 'PAGED_PLATFORM_APPLICATION_CLOSED');
  live();
  const pairing = () => ({ profile: C.DEVICE_PAGED_GRAPH_OWNER_V3, descriptor,
    ...(nativePreparation === null ? {} : { nativePreparation }) });
  const executor = Object.freeze({
    profile: DEVICE_PAGED_PLATFORM_PROFILE_V3,
    capabilities: Object.freeze({ prepare: true, execute: true, reconcile: true, recover: true }),
    ready() { live(); return true; },
    async submit(route, body) {
      live();
      const method = typeof route === 'string' && Object.hasOwn(routes, route) ? routes[route] : null;
      assert.ok(method, 'PAGED_PLATFORM_ORIGINAL_ROUTE_REQUIRED');
      let result;
      if (method === 'pairing') { P.pagedOwnerExactV3(body, []); result = pairing(); }
      else if (method === 'challenge' || method === 'graphChallenge') result = await dispatch(method, [body]);
      else {
        const request = P.pagedOwnerExactV3(body, ['consent', 'signature', 'ciphertext']);
        // submit consumes only the original account-issued consent and verifies
        // device ownership, current lineage, deployed state and private inputs.
        result = await dispatch(method, [request.consent, request.signature, request.ciphertext]);
      }
      live(); return result;
    },
  });

  const send = (response, status, value) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(JSON.stringify(value));
  };
  const handler = async (request, response) => {
    const chunks = [];
    let bytes;
    try {
      live();
      assert.ok(request.headers.origin === undefined || request.headers.origin === descriptor.origin,
        'PAGED_PLATFORM_ORIGIN_BINDING');
      if (request.method === 'GET' && request.url === '/health/live') return send(response, 200, { status: 'LIVE' });
      if (request.method === 'GET' && request.url === '/health/ready') return send(response, 200, { status: 'READY', profile: executor.profile });
      if (request.method === 'GET' && request.url === '/v1/mobile/paged-owner/capabilities') {
        return send(response, 200, { version: 3, profile: executor.profile,
          protocol: C.DEVICE_PAGED_GRAPH_OWNER_V3, capabilities: executor.capabilities,
          custody: 'DEVICE', privatePortfolio: null, originalConsentRequired: true });
      }
      if (request.method !== 'POST' || !Object.hasOwn(routes, request.url)) return send(response, 404, { error: 'PAGED_PLATFORM_ROUTE_NOT_FOUND' });
      assert.ok(/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? ''),
        'PAGED_PLATFORM_CONTENT_TYPE');
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length; assert.ok(size <= MAX_BODY, 'PAGED_PLATFORM_BODY_LIMIT'); chunks.push(chunk);
      }
      live(); bytes = Buffer.concat(chunks);
      const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      bytes.fill(0); bytes = null;
      const result = await executor.submit(request.url, input);
      live(); return send(response, 200, result);
    } catch (error) {
      retainDevicePagedFailureMetadataV3(error, 'GRAPH_HTTP');
      if (!response.headersSent && !response.destroyed) send(response, 403, { error: 'PAGED_GRAPH_OPERATION_REJECTED' });
    } finally {
      bytes?.fill(0); for (const chunk of chunks) chunk.fill(0);
    }
  };
  return Object.freeze({ profile: executor.profile, executor, handler, close() { closed = true; } });
}
