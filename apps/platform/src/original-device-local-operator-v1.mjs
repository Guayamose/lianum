/** Explicit local operator startup, independent of SQL/Cloud run.mjs. The only
 * backend import is the generated ORIGINAL realm; canonical copies cannot
 * supply its WeakMaps. Public device identity and operator TLS are the inputs.
 * This creates a NEW local realm; it never adopts an existing funded database. */
import { types } from 'node:util';
function exact(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== names.length || !names.every(name =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value')))
    throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
}
const original = new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-device-local-operator-v1.mjs', import.meta.url);
export async function startPlatformOriginalDeviceLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey } };
  for (const value of [selected.origin, selected.devicePublicKey, selected.tls.certificate, selected.tls.privateKey])
    if (typeof value !== 'string') throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const { createOriginalNativeDeviceLocalOperatorV1 } = await import(original);
  return createOriginalNativeDeviceLocalOperatorV1(selected);
}
/** Infrastructure ports only, before birth; genuine fixed backend factories
 * create account/keeper/bridges and install SQL admission in the same realm. */
export async function startPlatformOriginalDeviceDurableLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls', 'pool', 'privacyKey']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey }, pool: input.pool, privacyKey: input.privacyKey };
  const { createOriginalNativeDeviceDurableLocalOperatorV1 } = await import(original);
  return createOriginalNativeDeviceDurableLocalOperatorV1(selected);
}
export async function platformOriginalDeviceLocalConfigurationPathV1() {
  if (arguments.length !== 0) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  const { originalNativeDeviceLocalConfigurationPathV1 } = await import(original);
  return originalNativeDeviceLocalConfigurationPathV1();
}

/** A separate fixed caller opens one complete original NativeNote F checkpoint.
 * The private reference JSON is not an account/runtime/permission. */
export async function reopenPlatformOriginalDeviceLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey } };
  for (const value of [selected.origin, selected.devicePublicKey, selected.tls.certificate, selected.tls.privateKey])
    if (typeof value !== 'string') throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const module = await import(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-device-local-restart-v1.mjs', import.meta.url));
  return module.reopenOriginalNativeDeviceLocalOperatorV1(selected);
}

/** Separate full native observed realm with separately armed F; no mode in config. */
export async function startPlatformOriginalDeviceLiveRecoveryOperatorV1(input){
  if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input,['origin','devicePublicKey','tls']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey}};
  for(const value of [selected.origin,selected.devicePublicKey,selected.tls.certificate,selected.tls.privateKey])
    if(typeof value!=='string')throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const {createOriginalNativeDeviceLiveRecoveryOperatorV1}=await import(original);
  return createOriginalNativeDeviceLiveRecoveryOperatorV1(selected);
}
