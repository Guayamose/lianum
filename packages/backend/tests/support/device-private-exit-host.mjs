/** Fixed inert native ports for the real private exit module. The module owns
 * its original maps and issuers; this fixture never reads or replaces them. */
import {mock} from 'node:test';
import {randomUUID} from 'node:crypto';

const backend = new URL('../../src/', import.meta.url);
const imports = [
 ['operations/deployments/system/deploy-system.mjs', ['assertOwnedFlatSystem']],
 ['operations/deployments/defi/official-protocol-fixture-v3.mjs', ['assertOfficialProtocolFixture']],
 ['operations/deployments/defi/official-aave-fixture-v1.mjs', ['assertOfficialAaveFixtureV1']],
 ['operations/deployments/defi/deploy-morpho-blue-position-v1.mjs', ['assertOwnedOriginalMorphoBluePositionV1']],
 ['accounts/authority/device-external-flat-note-authority-v1.mjs', ['assertOriginalDeviceExternalFlatNoteAuthorityV1', 'readOriginalDeviceExternalFlatShareWithdrawalV1']],
 ['defi/vaults/owned-metamorpho-vault.mjs', ['assertOwnedMetaMorphoVault', 'isOwnedMorphoBluePositionVaultV1', 'isOwnedDeviceAaveStaticVaultV1', 'isOwnedDeviceMetaMorphoVaultV2', 'ownedMetaMorphoVaultBinding', 'readOriginalOfficialVaultNativeCostsV1', 'captureRetainedOwnedOfficialStaticVaultV1', 'checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3']],
 ['defi/vaults/retained-external-vault-journal-v1.mjs', ['createRetainedPrivateVaultExitJournalV1', 'openRetainedPrivateVaultExitJournalV1', 'assertOriginalExternalVaultJournalV1']],
 ['operations/recovery/device-external-flat-original-source-v2.mjs', ['consumeOriginalDeviceGraphSourceRequestV2', 'beginOriginalDeviceGraphSourceActivityV2', 'endOriginalDeviceGraphSourceActivityV2', 'assertOriginalDeviceGraphSourceAvailableV2']],
];
export async function loadDevicePrivateExitHost(ports, recovery) {
 const mocks = [];
 const restore = () => { for (const item of mocks.reverse()) item.restore(); mocks.length = 0; };
 try {
  for (const [relative, names] of imports) {
   const exports = Object.fromEntries(names.map(name => [name, ports[name] ?? (() => { throw Error('HOST_UNEXPECTED_NATIVE_PORT_' + name); })]));
   mocks.push(mock.module(new URL(relative, backend), {exports}));
  }
  mocks.push(mock.module(new URL('operations/local/device-external-flat-source-graph-service-v1.mjs', backend), {exports: recovery}));
  const api = await import(new URL('defi/withdrawals/device-morpho-blue-private-exit-v1.mjs?host=' + randomUUID(), backend));
  return {api, restore};
 } catch (error) { restore(); throw error; }
}
