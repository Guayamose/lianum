/** Canonical external-DeFi catalogue recovery composition. The original resource owners
 * and lazy loaders are bound once here; no canonical setter or registry writer
 * escapes. Public methods retain their original signatures and guards. */
import { buildExternalDefiCatalogueRecoveryV1 } from "./external-defi-catalogue-recovery-backend-v1.mjs";
import {
  captureRetainedFlatJournalCatalogueV1,
  retainedFlatJournalCatalogueRuntimeV1,
  reopenRetainedFlatJournalCatalogueV1,
  reopenRetainedFlatJournalGenerationV1,
} from "../storage/flat-journal-catalogue.mjs";
import {
  captureRetainedFlatAccountV1,
  reopenRetainedCatalogueFlatAccountV1,
} from "../authority/flat-account-authority.mjs";
import { createFlatPortfolioAuthority } from "../authority/flat-portfolio-authority.mjs";
import { createFlatPoolAdmissionPolicy } from "../authority/flat-pool-admission-policy.mjs";
import { reopenRetainedFlatManualPortfolioKeeperV1 } from "../portfolio/flat-manual-portfolio-keeper.mjs";
import { assertOwnedFlatSystem } from "../../operations/deployments/system/deploy-system.mjs";
import { assertOwnedFlatOwnerProcess } from "../../custody/processes/flat-owner-process.mjs";
import { assertWrappedPrivateLifetimeAttemptV1 } from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
import {
  retainOriginalWrappedRecoverySectionV1,
  consumeOriginalWrappedRecoverySectionV1,
  originalWrappedRecoverySectionIdentityV1,
} from "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs";
const originalCatalogue = buildExternalDefiCatalogueRecoveryV1(
  Object.freeze({
    dependencies: Object.freeze({
      captureRetainedFlatJournalCatalogueV1,
      retainedFlatJournalCatalogueRuntimeV1,
      reopenRetainedFlatJournalCatalogueV1,
      reopenRetainedFlatJournalGenerationV1,
      captureRetainedFlatAccountV1,
      reopenRetainedCatalogueFlatAccountV1,
      createFlatPortfolioAuthority,
      createFlatPoolAdmissionPolicy,
      reopenRetainedFlatManualPortfolioKeeperV1,
      assertOwnedFlatSystem,
      assertOwnedFlatOwnerProcess,
      assertWrappedPrivateLifetimeAttemptV1,
      retainOriginalWrappedRecoverySectionV1,
      consumeOriginalWrappedRecoverySectionV1,
      originalWrappedRecoverySectionIdentityV1,
    }),
    load: Object.freeze({
      wrappedRecoveryAuthorityV1: () =>
        import(
          "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
        ),
      ownedEvmV2Runtime: () =>
        import("../../chains/evm/runtime/owned-evm-v2-runtime.mjs"),
      officialAaveFixtureV1: () =>
        import(
          "../../operations/deployments/defi/official-aave-fixture-v1.mjs"
        ),
      privateVaultExit: () =>
        import("../../defi/withdrawals/private-vault-exit.mjs"),
      ownedMetamorphoVault: () =>
        import("../../defi/vaults/owned-metamorpho-vault.mjs"),
      flatJournalCatalogue: () =>
        import("../storage/flat-journal-catalogue.mjs"),
      externalDefiRetainedVaultWalletV1: () =>
        import("./external-defi-retained-vault-wallet-v1.mjs"),
      officialProtocolFixtureV3: () =>
        import(
          "../../operations/deployments/defi/official-protocol-fixture-v3.mjs"
        ),
      generationPrivateVaultExit: () =>
        import("../../defi/withdrawals/generation-private-vault-exit.mjs"),
      flatManualGraphSession: () =>
        import("../../api/accounts/flat-manual-graph-session.mjs"),
      originalWalletEconomicStateV1: () =>
        import("../state/original-wallet-economic-state-v1.mjs"),
    }),
  }),
);

export function consumeExternalDefiCatalogueAccountReopenV1(token) {
  return originalCatalogue.consumeExternalDefiCatalogueAccountReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiCatalogueKeeperReopenV1(token) {
  return originalCatalogue.consumeExternalDefiCatalogueKeeperReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiCatalogueGenerationReopenV1(token) {
  return originalCatalogue.consumeExternalDefiCatalogueGenerationReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiOfficialVaultReopenV1(token) {
  return originalCatalogue.consumeExternalDefiOfficialVaultReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiPrivateVaultExitReopenV1(token) {
  return originalCatalogue.consumeExternalDefiPrivateVaultExitReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiProtocolFixtureReopenV1(token) {
  return originalCatalogue.consumeExternalDefiProtocolFixtureReopenV1(
    ...arguments,
  );
}

export function consumeExternalDefiCatalogueReopenV1(token) {
  return originalCatalogue.consumeExternalDefiCatalogueReopenV1(...arguments);
}

export async function reopenOriginalDeviceExternalFlatAaveProtocolV1(token) {
  return originalCatalogue.reopenOriginalDeviceExternalFlatAaveProtocolV1(
    ...arguments,
  );
}

export async function retainExternalDefiCatalogueForReopenV1(
  catalogue,
  attemptAuthority,
) {
  return originalCatalogue.retainExternalDefiCatalogueForReopenV1(...arguments);
}

export async function reopenExternalDefiCatalogueFromRecoveryV1(
  input,
  callbacks = {},
) {
  return originalCatalogue.reopenExternalDefiCatalogueFromRecoveryV1(
    ...arguments,
  );
}

export async function retainExternalDefiVaultCatalogueForReopenV1(
  input,
  attemptAuthority,
) {
  return originalCatalogue.retainExternalDefiVaultCatalogueForReopenV1(
    ...arguments,
  );
}

export async function reopenExternalDefiVaultCatalogueFromRecoveryV1(input) {
  return originalCatalogue.reopenExternalDefiVaultCatalogueFromRecoveryV1(
    ...arguments,
  );
}
export const {} = originalCatalogue;
