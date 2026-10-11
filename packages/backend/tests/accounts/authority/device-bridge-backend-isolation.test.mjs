/** Actual bridge families over inert native ports. These tests mint only
 * backend-local bridge identities; no native process, proof or send runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { buildDeviceDepositBridgeBackendV1 } from '../../../src/accounts/authority/device-deposit-bridge-backend-v1.mjs';
import { buildDeviceReservationBridgeBackendV1 } from '../../../src/accounts/authority/device-reservation-bridge-backend-v1.mjs';
import { buildDeviceExecutionBridgeBackendV1 } from '../../../src/accounts/authority/device-execution-bridge-backend-v1.mjs';
import * as canonical from '../../../src/accounts/authority/native-value-account-authority-v2.mjs';
import { createGenericBalanceNativePreparation } from '@lianum/engine/execution/balances/generic-balance-native-preparation';

const hash = (value) =>
  createHash('sha256')
    .update('isolated-device-bridge:' + value)
    .digest('hex');
function fixture() {
  const publicKey = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).publicKey.export({
    format: 'jwk',
  });
  const descriptor = Object.freeze({
    origin: 'https://host.invalid',
    pairingId: hash('pair'),
    devicePublicKey:
      '04' +
      Buffer.from(publicKey.x, 'base64url').toString('hex') +
      Buffer.from(publicKey.y, 'base64url').toString('hex'),
  });
  const actor = Object.freeze({}),
    account = Object.freeze({}),
    owner = Object.freeze({}),
    runtime = Object.freeze({}),
    system = Object.freeze({}),
    executor = Object.freeze({}),
    custody = Object.freeze({});
  const input = { actor, account, owner, runtime, system, poolIndex: 0 };
  let installations = 0;
  const never = () => assert.fail('no permission/proof/send during bridge construction');
  const checkAccount = (value, expected) => {
    assert.equal(value, account);
    assert.equal(expected.runtime, runtime);
    assert.equal(expected.system, system);
    assert.equal(expected.poolIndex, 0);
    if (Object.hasOwn(expected, 'owner')) assert.equal(expected.owner, owner);
  };
  const actors = Object.freeze({
    assertPairedOriginalAccountActorV2: (value) => assert.equal(value, actor),
    assertPairedOriginalAccountActorAccountV2(value, a) {
      assert.equal(value, actor);
      assert.equal(a, account);
    },
    pairedOriginalAccountActorDescriptorV2(value) {
      assert.equal(value, actor);
      return descriptor;
    },
  });
  const systems = Object.freeze({
    assertOwnedNativeValueWalletSystem(r, s) {
      assert.equal(r, runtime);
      assert.equal(s, system);
    },
  });
  const observation = Object.freeze({
    async createNativeValueSystemStateReader(expected) {
      assert.deepEqual(expected, { runtime, system, poolIndex: 0 });
      return Object.freeze({ read: never, assertCurrent: never });
    },
  });
  const depositPorts = Object.freeze({
    account: Object.freeze({
      assertOwnedNativeValueAccountAuthority: checkAccount,
      runDeviceOwnerDepositAuthorizationV1: never,
      readDeviceOwnerDepositStatusV1: never,
      installOriginalNativePrivateDepositV2(a) {
        assert.equal(a, account);
        installations++;
      },
    }),
    actor: actors,
    system: systems,
    observation,
  });
  const reservationPorts = Object.freeze({
    account: Object.freeze({
      assertOwnedNativeValueAccountAuthority: checkAccount,
      runDeviceOwnerReservationAuthorizationV1: never,
      readDeviceOwnerReservationStatusV1: never,
      installOriginalNativePrivateReservationV2(a) {
        assert.equal(a, account);
        installations++;
      },
      readOriginalNativePrivateReservationContextV2: never,
    }),
    actor: actors,
    system: systems,
    observation,
  });
  const reserve = buildDeviceReservationBridgeBackendV1(reservationPorts);
  const executionPorts = Object.freeze({
    executor: Object.freeze({
      assertOwnedNativeValueExecution(value, expected) {
        assert.equal(value, executor);
        assert.deepEqual(expected, { runtime, system, poolIndex: 0 });
      },
    }),
    providers: Object.freeze({
      assertOwnedNativeValueProviderCustody(value, expected) {
        assert.equal(value, custody);
        assert.deepEqual(expected, { runtime, system, poolIndex: 0 });
      },
    }),
    reservation: Object.freeze({
      assertDeviceOwnerReservationBridgeV1: reserve.assertDeviceOwnerReservationBridgeV1,
      deviceOwnerReservationBridgeActorV1: reserve.deviceOwnerReservationBridgeActorV1,
    }),
    account: Object.freeze({
      installDeviceOwnerExecutionV1(a) {
        assert.equal(a, account);
        installations++;
      },
      readDeviceOwnerExecutionStatusV1: never,
      runDeviceOwnerExecutionAuthorizationV1: never,
      installOriginalNativePrivateExitV2(a) {
        assert.equal(a, account);
        installations++;
      },
      assertOwnedNativeValueAccountAuthority: checkAccount,
      prepareDeviceOwnerExitV1: never,
      readDeviceOwnerExitStatusV1: never,
      runDeviceOwnerExitAuthorizationV1: never,
      readDeviceOwnerOutputBalanceV1: never,
      readDeviceOwnerRecoveryArmTermsV1: never,
      runDeviceOwnerRecoveryArmAuthorizationV1: never,
    }),
    observation,
  });
  function preparation() {
    return createGenericBalanceNativePreparation({
      ...Object.fromEntries(
        ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId'].map(
          (name) => [name, hash(name)],
        ),
      ),
      fundingNotBefore: '6000',
      fundingValidUntil: '6100',
      settleBefore: '6300',
      nodes: [
        {
          id: 'leg_0',
          dependsOn: [],
          evidencePolicy: hash('evidence'),
          actionTemplate: {
            chainDomain: hash('chain'),
            signerIdentity: hash('signer'),
            sourceCommitment: hash('source'),
            destinationCommitment: hash('destination'),
            amount: '1000',
            custodyKind: 1,
            custodyCommitment: hash('custody'),
            executionFrom: '6000',
            executionUntil: '6200',
          },
          recipientOffer: {
            x: Buffer.from(publicKey.x, 'base64url').toString('hex'),
            y: Buffer.from(publicKey.y, 'base64url').toString('hex'),
            value: '25',
            secret: hash('secret'),
            randomness: hash('randomness'),
          },
        },
      ],
    });
  }
  return {
    input,
    account,
    actor,
    runtime,
    system,
    executor,
    custody,
    descriptor,
    depositPorts,
    reservationPorts,
    reserve,
    executionPorts,
    preparation,
    installations: () => installations,
  };
}

test('D26 bridge constructors and guards share only their own original instance', async () => {
  const f = fixture(),
    first = buildDeviceDepositBridgeBackendV1(f.depositPorts),
    second = buildDeviceDepositBridgeBackendV1(f.depositPorts);
  const bridge = await first.createOriginalNativePrivateWorkerDepositBridgeV3(f.input);
  try {
    assert.equal(first.isOriginalNativePrivateWorkerDepositBridgeV3(bridge), true);
    assert.equal(first.assertDeviceOwnerDepositBridgeV1(bridge, f.account), f.descriptor);
    assert.throws(
      () => first.assertDeviceOwnerDepositBridgeV1({ ...bridge }, f.account),
      /ORIGINAL_REQUIRED/,
    );
    assert.throws(
      () => second.assertDeviceOwnerDepositBridgeV1(bridge, f.account),
      /ORIGINAL_REQUIRED/,
    );
    assert.throws(
      () => canonical.assertDeviceOwnerDepositBridgeV1(bridge, f.account),
      /ORIGINAL_REQUIRED/,
    );
    assert.throws(
      () => canonical.consumeDeviceOwnerDepositAuthorizationV1(bridge, {}, f.account),
      /ORIGINAL_REQUIRED/,
    );
    await assert.rejects(canonical.createDeviceOwnerDepositBridgeV1(f.input));
    assert.equal(f.installations(), 1);
  } finally {
    await bridge.close();
  }
});

test('U/S and execution bridge families preserve instance pairing and one-use installation', async () => {
  const f = fixture(),
    reservation = await f.reserve.createOriginalNativePrivateReservationBridgeV2({
      ...f.input,
      nativePreparation: f.preparation(),
      invoiceSignatures: ['1'.repeat(128)],
    });
  const first = buildDeviceExecutionBridgeBackendV1(f.executionPorts),
    second = buildDeviceExecutionBridgeBackendV1(f.executionPorts);
  const bridge = await first.createOriginalNativePrivateWorkerExecutionBridgeV3({
    account: f.account,
    reservationBridge: reservation,
    nativeExecution: f.executor,
    providers: [{ slot: 0, custody: f.custody, deliveryRiskSalt: hash('risk') }],
    runtime: f.runtime,
    system: f.system,
    poolIndex: 0,
  });
  try {
    assert.equal(
      f.reserve.assertDeviceOwnerReservationBridgeV1(reservation, f.account),
      f.descriptor,
    );
    assert.throws(
      () =>
        buildDeviceReservationBridgeBackendV1(
          f.reservationPorts,
        ).assertDeviceOwnerReservationBridgeV1(reservation, f.account),
      /ORIGINAL_BRIDGE/,
    );
    assert.throws(
      () => canonical.assertDeviceOwnerReservationBridgeV1(reservation, f.account),
      /ORIGINAL_BRIDGE/,
    );
    assert.equal(first.assertDeviceOwnerExecutionBridgeV1(bridge, f.account), f.descriptor);
    assert.equal(first.isOriginalNativePrivateWorkerExecutionBridgeV3(bridge), true);
    assert.throws(
      () => first.consumeDeviceOwnerExecutionInstallationV1({ ...bridge }, f.account),
      /ORIGINAL_BRIDGE/,
    );
    assert.throws(
      () => second.consumeDeviceOwnerExecutionInstallationV1(bridge, f.account),
      /ORIGINAL_BRIDGE/,
    );
    assert.throws(
      () => canonical.consumeDeviceOwnerExecutionInstallationV1(bridge, f.account),
      /ORIGINAL_BRIDGE/,
    );
    const installed = first.consumeDeviceOwnerExecutionInstallationV1(bridge, f.account);
    assert.equal(installed.reservationBridge, reservation);
    assert.equal(installed.nativeExecution, f.executor);
    assert.equal(installed.providers[0].custody, f.custody);
    assert.throws(
      () => first.consumeDeviceOwnerExecutionInstallationV1(bridge, f.account),
      /INSTALLATION_ONCE/,
    );
    assert.equal(f.installations(), 3);
  } finally {
    await bridge.close();
    await reservation.close();
  }
});
