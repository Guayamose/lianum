/** Explicit operator composition in the canonical backend module graph.
 * No account lookup, SQL/V1 intent substitution, root key or remote callback.
 * The owner retains pool/backend lifetimes; this service owns its journal key
 * and one listener. A restart still requires the original recovery protocol. */
import { types } from 'node:util';
import { assertOriginalDeviceDispatchSchemaV1 } from './original-device-schema-v1.mjs';
export async function startPlatformOriginalDeviceDurableServiceV1(input) {
  const fields = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['depositBridge', 'reservationBridge', 'executionBridge', 'pool', 'privacyKey', 'tls', 'host']
    : ['depositBridge', 'reservationBridge', 'executionBridge', 'pool', 'privacyKey', 'tls'];
  if (arguments.length !== 1 || !input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== fields.length || !fields.every(name =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(input, name) ?? {}, 'value')))
    throw Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
  await assertOriginalDeviceDispatchSchemaV1(input.pool);
  const { createOriginalDeviceDurableDispatchV1 } = await import(new URL('../../../packages/backend/src/api/mobile/original-device-durable-dispatch-v1.mjs', import.meta.url));
  const { createPairedDurableDeviceAccountTlsServerV1 } = await import(new URL('../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs', import.meta.url));
  const { pairedOriginalAccountActorDescriptorV2 } = await import(new URL('../../../packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs', import.meta.url));
  const { deviceOwnerDepositBridgeActorV1 } = await import(new URL('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs', import.meta.url));
  const bridges = { depositBridge: input.depositBridge, reservationBridge: input.reservationBridge, executionBridge: input.executionBridge };
  const descriptor = pairedOriginalAccountActorDescriptorV2(deviceOwnerDepositBridgeActorV1(input.depositBridge));
  const dispatch = await createOriginalDeviceDurableDispatchV1({ ...bridges, pool: input.pool, privacyKey: input.privacyKey });
  let server;
  try { server = await createPairedDurableDeviceAccountTlsServerV1({ ...bridges, dispatch, tls: input.tls,
    ...(fields.includes('host') ? { host: input.host } : {}) }); }
  catch (error) { dispatch.close(); throw error; }
  let closing;
  return Object.freeze({ origin: server.url, descriptor, durableOriginalAdmission: true,
    close() {
      if (arguments.length !== 0) throw Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
      closing ??= (async () => { try { return await server.close(); } finally { dispatch.close(); } })();
      return closing;
    },
  });
}
