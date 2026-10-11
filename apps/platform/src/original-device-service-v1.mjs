/** Private operator entry for a surviving ORIGINAL backend realm. The app
 * connects directly to this exact TLS origin with its existing V2 clients.
 * No SQL/V1 executor, JSON capability restoration or account lookup is used.
 * The original bootstrap owns account/session/owner/executor/provider/runtime
 * lifetimes and their encrypted journals; this service owns only the actor's
 * three installed bridges and one listener. A full process restart currently
 * requires an original recovery contract; SQL or this descriptor cannot make
 * a replacement actor/account. No root or private note key is accepted here. */
import { types } from 'node:util';
// All bridges and servers share the canonical backend authority instance.
export async function startPlatformOriginalDeviceServiceV1(input) {
  if (arguments.length !== 1 || !input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
    throw new Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
  const names = Object.hasOwn(input, 'host')
    ? ['depositBridge', 'reservationBridge', 'executionBridge', 'tls', 'host']
    : ['depositBridge', 'reservationBridge', 'executionBridge', 'tls'];
  if (Reflect.ownKeys(input).length !== names.length || !names.every(name =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(input, name) ?? {}, 'value')))
    throw new Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
  const { createPairedDeviceAccountTlsServerV1 } = await import(new URL('../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs', import.meta.url));
  const { pairedOriginalAccountActorDescriptorV2 } = await import(new URL('../../../packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs', import.meta.url));
  const { deviceOwnerDepositBridgeActorV1 } = await import(new URL('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs', import.meta.url));
  // Private delivery to the operator who performed explicit device pairing.
  // This value is never returned by GET state or obtained from a public ID.
  const descriptor = pairedOriginalAccountActorDescriptorV2(deviceOwnerDepositBridgeActorV1(input.depositBridge));
  const server = await createPairedDeviceAccountTlsServerV1(input);
  let closing;
  return Object.freeze({ origin: server.url, descriptor,
    close() {
      if (arguments.length !== 0) throw new Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
      closing ??= server.close(); return closing;
    },
  });
}
