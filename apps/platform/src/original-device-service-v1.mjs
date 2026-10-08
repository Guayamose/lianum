/** Private operator entry for a surviving ORIGINAL backend realm. The app
 * connects directly to this exact TLS origin with its existing V2 clients.
 * No SQL/V1 executor, JSON capability restoration or account lookup is used.
 * The original bootstrap owns account/session/owner/executor/provider/runtime
 * lifetimes and their encrypted journals; this service owns only the actor's
 * three installed bridges and one listener. A full process restart currently
 * requires an original recovery contract; SQL or this descriptor cannot make
 * a replacement actor/account. No root or private note key is accepted here. */
import { types } from 'node:util';
// Use the one generated ORIGINAL module graph. Importing canonical backend
// copies here would create different WeakMaps and must not adopt their shapes.
const backend = new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/mobile/', import.meta.url);
export async function startPlatformOriginalDeviceServiceV1(input) {
  if (arguments.length !== 1 || !input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
    throw new Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
  const names = Object.hasOwn(input, 'host')
    ? ['depositBridge', 'reservationBridge', 'executionBridge', 'tls', 'host']
    : ['depositBridge', 'reservationBridge', 'executionBridge', 'tls'];
  if (Reflect.ownKeys(input).length !== names.length || !names.every(name =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(input, name) ?? {}, 'value')))
    throw new Error('PLATFORM_ORIGINAL_DEVICE_CONFIGURATION');
  const { createPairedDeviceAccountTlsServerV1 } = await import(new URL('paired-original-account-http-v2.mjs', backend));
  const { pairedOriginalAccountActorDescriptorV2 } = await import(new URL('paired-original-account-actor-v2.mjs', backend));
  const { deviceOwnerDepositBridgeActorV1 } = await import(new URL('../global-state/device-owner-deposit-bridge-v1.mjs', backend));
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
