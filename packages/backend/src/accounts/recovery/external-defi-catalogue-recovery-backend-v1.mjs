import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
/** The canonical composition binds these names privately. Independent builders
 * issue handles only in their own maps and cannot select the canonical ports. */
export const CATALOGUE_RECOVERY_LOADERS_V1 = Object.freeze([
  "wrappedRecoveryAuthorityV1",
  "ownedEvmV2Runtime",
  "officialAaveFixtureV1",
  "privateVaultExit",
  "ownedMetamorphoVault",
  "flatJournalCatalogue",
  "externalDefiRetainedVaultWalletV1",
  "officialProtocolFixtureV3",
  "generationPrivateVaultExit",
  "flatManualGraphSession",
  "originalWalletEconomicStateV1",
]);
export const CATALOGUE_RECOVERY_DEPENDENCIES_V1 = Object.freeze([
  "captureRetainedFlatJournalCatalogueV1",
  "retainedFlatJournalCatalogueRuntimeV1",
  "reopenRetainedFlatJournalCatalogueV1",
  "reopenRetainedFlatJournalGenerationV1",
  "captureRetainedFlatAccountV1",
  "reopenRetainedCatalogueFlatAccountV1",
  "createFlatPortfolioAuthority",
  "createFlatPoolAdmissionPolicy",
  "reopenRetainedFlatManualPortfolioKeeperV1",
  "assertOwnedFlatSystem",
  "assertOwnedFlatOwnerProcess",
  "assertWrappedPrivateLifetimeAttemptV1",
  "retainOriginalWrappedRecoverySectionV1",
  "consumeOriginalWrappedRecoverySectionV1",
  "originalWrappedRecoverySectionIdentityV1",
]);
export function buildExternalDefiCatalogueRecoveryV1(contracts) {
  assert.equal(arguments.length, 1);
  exactRecord(contracts, ["dependencies", "load"]);
  const { dependencies, load } = contracts;
  exactRecord(dependencies, CATALOGUE_RECOVERY_DEPENDENCIES_V1);
  exactRecord(load, CATALOGUE_RECOVERY_LOADERS_V1);
  for (const name of CATALOGUE_RECOVERY_LOADERS_V1)
    assert.equal(
      typeof load[name],
      "function",
      "CATALOGUE_RECOVERY_FIXED_RESOURCE_CONTRACT",
    );
  const {
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
  } = dependencies;
  /** Fixed external-DeFi catalogue continuation. Only the existing ordered AEAD
   * issuer may supply a successor token. This restores retained EXIT bindings;
   * it neither adopts legacy journals nor restores consent/new admissions. */

  const restoredMembers = new WeakMap();
  const tokens = new WeakMap(),
    opaque = () => Object.freeze(Object.create(null));
  function consume(token, kind) {
    const row = tokens.get(token);
    assert.ok(
      row && row.kind === kind && !row.used,
      "EXTERNAL_CATALOGUE_ORIGINAL_REOPEN_TOKEN",
    );
    row.used = true;
    return row.value;
  }
  function consumeExternalDefiCatalogueAccountReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "account");
  }
  function consumeExternalDefiCatalogueKeeperReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "keeper");
  }
  function consumeExternalDefiCatalogueGenerationReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "generation");
  }
  function consumeExternalDefiOfficialVaultReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "official-vault");
  }
  function consumeExternalDefiPrivateVaultExitReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "vault-exit");
  }
  function consumeExternalDefiProtocolFixtureReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "protocol-fixture");
  }
  function consumeExternalDefiCatalogueReopenV1(token) {
    assert.equal(arguments.length, 1);
    return consume(token, "catalogue");
  }
  async function reopenOriginalDeviceExternalFlatAaveProtocolV1(token) {
    assert.equal(arguments.length, 1);
    const { consumeExternalDefiBootstrapPartV1 } =
      await load.wrappedRecoveryAuthorityV1();
    const { runtime, record } = consumeExternalDefiBootstrapPartV1(
      token,
      "protocols",
    );
    const { assertOwnedDeviceExternalFlatReceiverV1 } =
      await load.ownedEvmV2Runtime();
    assertOwnedDeviceExternalFlatReceiverV1(runtime);
    assert.equal(record.schema, "ORIGINAL_OFFICIAL_AAVE_FIXTURE_V1");
    const { reopenOfficialAaveFixtureRecoveryV1 } =
      await load.officialAaveFixtureV1();
    return issue(
      "protocol-fixture",
      { runtime, record },
      reopenOfficialAaveFixtureRecoveryV1,
    );
  }
  async function issue(kind, value, work) {
    const token = opaque(),
      entry = { kind, value, used: false };
    tokens.set(token, entry);
    try {
      const result = await work(token);
      assert.equal(entry.used, true, "EXTERNAL_CATALOGUE_TOKEN_UNUSED");
      return result;
    } finally {
      tokens.delete(token);
    }
  }
  function callbacksCheck(callbacks) {
    exactRecord(callbacks, Object.keys(callbacks));
    assert.ok(Object.keys(callbacks).every((name) => name === "onProof"));
    if (callbacks.onProof !== undefined)
      assert.equal(typeof callbacks.onProof, "function");
  }
  async function closeResources(resources) {
    const failures = [];
    for (const resource of [...resources].reverse())
      try {
        await resource.close();
      } catch (error) {
        failures.push(error);
      }
    if (failures.length)
      throw new AggregateError(
        failures,
        "EXTERNAL_CATALOGUE_ORIGINAL_CLOSE_FAILED",
      );
  }
  async function retainExternalDefiCatalogueForReopenV1(
    catalogue,
    attemptAuthority,
  ) {
    assert.equal(arguments.length, 2);
    const original = originalWrappedRecoverySectionIdentityV1(
      attemptAuthority,
      "wallet",
    );
    assertWrappedPrivateLifetimeAttemptV1(
      retainedFlatJournalCatalogueRuntimeV1(catalogue),
      original,
    );
    const saved = await captureCatalogueV1(catalogue);
    await retainOriginalWrappedRecoverySectionV1(attemptAuthority, "wallet", {
      schema: "EXTERNAL_ORIGINAL_CATALOGUE_WALLET_V1",
      sourceSHA256: original.sourceSHA256,
      saved,
    });
    return { retained: true, originalResourcesStopped: true };
  }
  async function reopenExternalDefiCatalogueFromRecoveryV1(
    input,
    callbacks = {},
  ) {
    callbacksCheck(callbacks);
    exactRecord(input, ["runtime", "system", "owners", "attemptAuthority"]);
    const { runtime, system, owners, attemptAuthority } = input;
    assertWrappedPrivateLifetimeAttemptV1(
      runtime,
      originalWrappedRecoverySectionIdentityV1(attemptAuthority, "wallet"),
    );
    assertOwnedFlatSystem(runtime, system);
    assert.ok(
      Array.isArray(owners) && owners.length === 2 && owners[0] !== owners[1],
    );
    owners.forEach((owner, poolIndex) =>
      assertOwnedFlatOwnerProcess(owner, { runtime, system, poolIndex }),
    );
    const original = originalWrappedRecoverySectionIdentityV1(
      attemptAuthority,
      "wallet",
    );
    const retained = consumeOriginalWrappedRecoverySectionV1(
      attemptAuthority,
      "wallet",
    );
    exactRecord(retained, ["schema", "sourceSHA256", "saved"]);
    assert.equal(retained.schema, "EXTERNAL_ORIGINAL_CATALOGUE_WALLET_V1");
    assert.equal(retained.sourceSHA256, original.sourceSHA256);
    return reopenCatalogueV1(
      { runtime, system, owners },
      retained.saved,
      callbacks,
    );
  }
  async function reopenCatalogueV1(
    { runtime, system, owners },
    saved,
    callbacks = {},
  ) {
    exactRecord(saved, [
      "schema",
      "identity",
      "journal",
      "checkpoint",
      "record",
      "generations",
    ]);
    const vaultNotes =
      saved.schema === "EXTERNAL_FLAT_VAULT_NOTE_CATALOGUE_RECOVERY_V1";
    if (vaultNotes) {
      assert.equal(
        saved.identity.profile,
        "EXTERNAL_VAULT_NOTE_CATALOGUE_LIFETIME_V1",
      );
      assert.equal(
        saved.record.data.profile,
        "EXTERNAL_RETAINED_VAULT_NOTE_CATALOGUE_V1",
      );
      assert.equal(saved.generations.length, 1);
    } else assert.equal(saved.schema, "EXTERNAL_FLAT_CATALOGUE_RECOVERY_V1");
    assert.equal(saved.identity.genesis, runtime.metadata.evmGenesis);
    assert.ok(
      Array.isArray(saved.generations) &&
        saved.generations.length >= 1 &&
        saved.generations.length <= 8,
    );
    const generations = [],
      resources = [],
      pools = new Set(),
      members = [];
    try {
      for (const row of saved.generations) {
        exactRecord(row, [
          "descriptor",
          "config",
          "keeper",
          "accounts",
          "routeOrder",
        ]);
        const accounts = [];
        for (const member of row.accounts) {
          exactRecord(member, ["poolIndex", "account"]);
          if (vaultNotes)
            assert.equal(
              member.account.schema,
              "EXTERNAL_RETAINED_FLAT_VAULT_NOTES_V1",
            );
          else assert.equal(Object.hasOwn(member.account, "schema"), false);
          const poolIndex = member.poolIndex;
          assert.ok(
            (poolIndex === 0 || poolIndex === 1) && !pools.has(poolIndex),
            "EXTERNAL_CATALOGUE_ORIGINAL_POOL_REQUIRED",
          );
          pools.add(poolIndex);
          const account = await issue(
            "account",
            {
              input: {
                runtime,
                system,
                poolIndex,
                owner: owners[poolIndex],
                nativeExecution: null,
                accountId: member.account.accountId,
                journalId: member.account.journalId,
              },
              saved: member.account,
              callbacks,
              manualKeeper: row.keeper,
            },
            reopenRetainedCatalogueFlatAccountV1,
          );
          resources.push(account);
          assert.deepEqual(account.config, member.account.config);
          accounts.push({ poolIndex, account });
          members.push({
            poolIndex,
            account,
            generationId: row.descriptor.generationId,
          });
        }
        const poolAdmissions = await createFlatPoolAdmissionPolicy({
          runtime,
          system,
          accounts,
          routeOrder: row.routeOrder,
        });
        const portfolio = createFlatPortfolioAuthority({
          runtime,
          system,
          accounts,
          poolAdmissions,
          accountId: row.config.accountId,
          journalId: row.config.journalId,
        });
        resources.push(portfolio);
        assert.deepEqual(
          portfolio.config,
          row.config,
          "EXTERNAL_CATALOGUE_ORIGINAL_PORTFOLIO",
        );
        const keeper = await issue(
          "keeper",
          {
            input: { runtime, portfolio, journal: row.keeper.journal },
            saved: row.keeper,
          },
          reopenRetainedFlatManualPortfolioKeeperV1,
        );
        resources.push(keeper);
        generations.push(
          await issue(
            "generation",
            { runtime, portfolio, poolAdmissions, keeper, saved: row },
            reopenRetainedFlatJournalGenerationV1,
          ),
        );
      }
      const catalogue = await issue(
        "catalogue",
        {
          input: {
            runtime,
            initialGeneration: generations[0],
            journal: saved.journal,
          },
          saved,
          generations,
        },
        reopenRetainedFlatJournalCatalogueV1,
      );
      // An opener performs read-only original reconciliation before it returns any
      // executable facade. A failed/UNKNOWN result does not manufacture permission.
      for (const row of saved.record.data.bindings)
        await catalogue.keeper.reconcile(row.request.requestId);
      restoredMembers.set(catalogue, members);
      return catalogue;
    } catch (error) {
      try {
        await closeResources(resources);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "EXTERNAL_CATALOGUE_REOPEN_FAILED",
          { cause: error },
        );
      }
      throw error;
    }
  }

  async function captureCatalogueV1(catalogue) {
    const saved = await captureRetainedFlatJournalCatalogueV1(catalogue),
      accounts = saved.generations.flatMap((row) =>
        row.accounts.map((member) => member.account),
      ),
      seen = new Set();
    let failure;
    try {
      for (const generation of saved.generations) {
        const retained = [];
        for (const member of generation.accounts) {
          assert.ok(
            !seen.has(member.account),
            "EXTERNAL_CATALOGUE_ACCOUNT_REUSE",
          );
          seen.add(member.account);
          const account = await captureRetainedFlatAccountV1(member.account);
          assert.equal(account.poolIndex, member.poolIndex);
          retained.push({ poolIndex: member.poolIndex, account });
        }
        generation.accounts = retained;
      }
      // No service password/state is accepted from a caller. Every saved value was
      // produced by the branded closures and committed to the original lifetime.
    } catch (error) {
      failure = error;
    }
    try {
      await closeResources(accounts);
    } catch (cleanup) {
      failure = failure
        ? new AggregateError(
            [failure, cleanup],
            "EXTERNAL_CATALOGUE_CAPTURE_FAILED",
            { cause: failure },
          )
        : cleanup;
    }
    if (failure) throw failure;
    return saved;
  }

  /** Fixed composition of retained original MetaMorpho/Aave EXIT routes. Only
   * this producer can add their credentials to the existing wallet section. */
  async function retainExternalDefiVaultCatalogueForReopenV1(
    input,
    attemptAuthority,
  ) {
    assert.equal(arguments.length, 2);
    exactRecord(input, ["catalogue", "services"]);
    const { catalogue, services } = input;
    const original = originalWrappedRecoverySectionIdentityV1(
        attemptAuthority,
        "wallet",
      ),
      runtime = retainedFlatJournalCatalogueRuntimeV1(catalogue);
    assertWrappedPrivateLifetimeAttemptV1(runtime, original);
    assert.ok(
      Array.isArray(services) && services.length >= 1 && services.length <= 2,
      "EXTERNAL_VAULT_FIXED_SERVICE_COUNT",
    );
    const exits = await load.privateVaultExit(),
      vaults = await load.ownedMetamorphoVault();
    const { assertOwnedFlatJournalCatalogueAccount } =
      await load.flatJournalCatalogue();
    const contexts = services.map((service) => {
      const context = exits.retainedOwnedPrivateVaultExitContextV1(service);
      assert.equal(context.runtime, runtime);
      const member = assertOwnedFlatJournalCatalogueAccount(
        catalogue,
        context.account,
      );
      const vault = vaults.retainedOwnedOfficialStaticVaultContextV1(
        context.vault,
      );
      assert.equal(vault.runtime, runtime);
      return { service, context, member, vault };
    });
    assert.equal(
      new Set(contexts.map((row) => row.context.account)).size,
      contexts.length,
    );
    assert.equal(
      new Set(contexts.map((row) => row.context.vault)).size,
      contexts.length,
    );
    const { captureOriginalRetainedVaultEconomicStateV1 } =
      await load.externalDefiRetainedVaultWalletV1();
    const records = [],
      fixtures = [],
      fixtureIndexes = new Map();
    let failure, economic;
    try {
      economic = await captureOriginalRetainedVaultEconomicStateV1(catalogue);
      for (const row of contexts) {
        let fixtureIndex = fixtureIndexes.get(row.vault.fixture);
        if (fixtureIndex === undefined) {
          fixtureIndex = fixtures.length;
          fixtureIndexes.set(row.vault.fixture, fixtureIndex);
          const module =
            row.vault.variant === "AAVE_STATIC"
              ? await load.officialAaveFixtureV1()
              : await load.officialProtocolFixtureV3();
          const record = await (
            row.vault.variant === "AAVE_STATIC"
              ? module.captureOfficialAaveFixtureRecoveryV1
              : module.captureOfficialProtocolFixtureRecoveryV1
          )(runtime, row.vault.fixture);
          fixtures.push({ variant: row.vault.variant, record });
        }
        const exit = await exits.captureRetainedOwnedPrivateVaultExitV1(
            row.service,
          ),
          vault = await vaults.captureRetainedOwnedOfficialStaticVaultV1(
            row.context.vault,
          );
        records.push({
          generationId: row.member.generationId,
          poolIndex: row.context.poolIndex,
          account: structuredClone(row.context.account.config),
          fixtureIndex,
          vault,
          exit,
        });
      }
      const saved = await captureCatalogueV1(catalogue);
      await retainOriginalWrappedRecoverySectionV1(attemptAuthority, "wallet", {
        schema:
          economic === null
            ? "EXTERNAL_ORIGINAL_CATALOGUE_VAULT_WALLET_V1"
            : "EXTERNAL_ORIGINAL_CATALOGUE_VAULT_ECONOMIC_WALLET_V1",
        sourceSHA256: original.sourceSHA256,
        saved,
        fixtures,
        services: records,
        ...(economic === null ? {} : { economic }),
      });
    } catch (error) {
      failure = error;
    }
    if (failure) {
      try {
        const { closeRetainedFlatJournalCatalogueV1 } =
          await load.flatJournalCatalogue();
        await closeResources([
          { close: () => closeRetainedFlatJournalCatalogueV1(catalogue) },
          ...contexts.flatMap((row) => [row.context.vault, row.service]),
        ]);
      } catch (cleanup) {
        throw new AggregateError(
          [failure, cleanup],
          "EXTERNAL_VAULT_CAPTURE_CLEANUP_FAILED",
          { cause: failure },
        );
      }
      throw failure;
    }
    return { retained: true, originalResourcesStopped: true };
  }
  async function reopenExternalDefiVaultCatalogueFromRecoveryV1(input) {
    assert.equal(arguments.length, 1);
    exactRecord(input, ["runtime", "system", "owners", "attemptAuthority"]);
    const { runtime, system, owners, attemptAuthority } = input;
    const original = originalWrappedRecoverySectionIdentityV1(
      attemptAuthority,
      "wallet",
    );
    assertWrappedPrivateLifetimeAttemptV1(runtime, original);
    assertOwnedFlatSystem(runtime, system);
    assert.ok(
      Array.isArray(owners) && owners.length === 2 && owners[0] !== owners[1],
    );
    owners.forEach((owner, poolIndex) =>
      assertOwnedFlatOwnerProcess(owner, { runtime, system, poolIndex }),
    );
    const r = consumeOriginalWrappedRecoverySectionV1(
      attemptAuthority,
      "wallet",
    );
    const withEconomic =
      r.schema === "EXTERNAL_ORIGINAL_CATALOGUE_VAULT_ECONOMIC_WALLET_V1";
    exactRecord(
      r,
      withEconomic
        ? [
            "schema",
            "sourceSHA256",
            "saved",
            "fixtures",
            "services",
            "economic",
          ]
        : ["schema", "sourceSHA256", "saved", "fixtures", "services"],
    );
    if (!withEconomic)
      assert.equal(r.schema, "EXTERNAL_ORIGINAL_CATALOGUE_VAULT_WALLET_V1");
    assert.equal(r.sourceSHA256, original.sourceSHA256);
    assert.ok(
      Array.isArray(r.services) &&
        r.services.length >= 1 &&
        r.services.length <= 2,
    );
    assert.ok(
      Array.isArray(r.fixtures) &&
        r.fixtures.length >= 1 &&
        r.fixtures.length <= r.services.length,
    );
    const resources = [],
      fixtures = [],
      services = [];
    let catalogue;
    try {
      for (const row of r.fixtures) {
        exactRecord(row, ["variant", "record"]);
        assert.ok(["METAMORPHO", "AAVE_STATIC"].includes(row.variant));
        const module =
          row.variant === "AAVE_STATIC"
            ? await load.officialAaveFixtureV1()
            : await load.officialProtocolFixtureV3();
        fixtures.push(
          await issue(
            "protocol-fixture",
            { runtime, record: row.record },
            row.variant === "AAVE_STATIC"
              ? module.reopenOfficialAaveFixtureRecoveryV1
              : module.reopenOfficialProtocolVaultFixtureRecoveryV1,
          ),
        );
      }
      catalogue = await reopenCatalogueV1({ runtime, system, owners }, r.saved);
      const {
        closeRetainedFlatJournalCatalogueV1,
        assertOwnedFlatJournalCatalogueAccount,
      } = await load.flatJournalCatalogue();
      resources.push({
        close: () => closeRetainedFlatJournalCatalogueV1(catalogue),
      });
      const vaults = await load.ownedMetamorphoVault(),
        exits = await load.privateVaultExit(),
        { createGenerationPrivateVaultExit } =
          await load.generationPrivateVaultExit();
      for (const row of r.services) {
        exactRecord(row, [
          "generationId",
          "poolIndex",
          "account",
          "fixtureIndex",
          "vault",
          "exit",
        ]);
        assert.ok(
          Number.isSafeInteger(row.fixtureIndex) &&
            row.fixtureIndex >= 0 &&
            row.fixtureIndex < fixtures.length,
        );
        assert.equal(row.vault.variant, r.fixtures[row.fixtureIndex].variant);
        const accounts = restoredMembers.get(catalogue);
        assert.ok(accounts);
        const matches = accounts.filter(
          (member) =>
            member.poolIndex === row.poolIndex &&
            member.generationId === row.generationId,
        );
        assert.equal(
          matches.length,
          1,
          "EXTERNAL_VAULT_ORIGINAL_ACCOUNT_REQUIRED",
        );
        const account = matches[0].account;
        const membership = assertOwnedFlatJournalCatalogueAccount(
          catalogue,
          account,
        );
        assert.equal(membership.generationId, row.generationId);
        assert.deepEqual(account.config, row.account);
        const vault = await issue(
          "official-vault",
          {
            input: { runtime, protocolFixture: fixtures[row.fixtureIndex] },
            saved: row.vault,
          },
          vaults.reopenRetainedOwnedOfficialStaticVaultV1,
        );
        resources.push(vault);
        const service = await issue(
          "vault-exit",
          {
            input: {
              runtime,
              system,
              poolIndex: row.poolIndex,
              account,
              vault,
            },
            saved: row.exit,
          },
          exits.reopenRetainedOwnedPrivateVaultExitV1,
        );
        resources.push(service);
        services.push(service);
        for (const operation of row.exit.record.data.operations)
          await service.reconcile(operation.exit.requestId);
      }
      const exit = createGenerationPrivateVaultExit({
        runtime,
        catalogue,
        services,
      });
      let session = null,
        economicState = null;
      if (withEconomic) {
        exactRecord(r.economic, [
          "version",
          "profile",
          "journal",
          "checkpoint",
        ]);
        assert.equal(r.economic.version, 1);
        assert.equal(
          r.economic.profile,
          "ORIGINAL_PRIVATE_WALLET_ECONOMIC_STATE_V1",
        );
        exactRecord(r.economic.journal, ["path", "password"]);
        const { createFlatManualGraphCatalogueSession } =
          await load.flatManualGraphSession();
        session = (
          await createFlatManualGraphCatalogueSession({ runtime, catalogue })
        ).session;
        resources.push({
          close: async () => {
            if ((await session.idle()).phase !== "CLOSED")
              await session.quiesceForPrivateRecovery();
            return session.close();
          },
        });
        const { openOriginalWalletEconomicStateV1 } =
          await load.originalWalletEconomicStateV1();
        economicState = await openOriginalWalletEconomicStateV1({
          catalogues: [{ runtime, catalogue, session, positions: exit }],
          nativeAccounts: [],
          wrappedPortfolios: [],
          journal: r.economic.journal,
          checkpoint: r.economic.checkpoint,
        });
        resources.push(economicState);
        r.economic.journal.password = null;
      }
      return Object.freeze({
        catalogue,
        services: Object.freeze(services),
        exit,
        ...(withEconomic
          ? {
              session,
              economicState,
              economicStateOriginalCheckpoint: r.economic.checkpoint,
            }
          : {}),
        close: () => closeResources(resources),
      });
    } catch (error) {
      try {
        await closeResources(resources);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "EXTERNAL_VAULT_REOPEN_FAILED",
          { cause: error },
        );
      }
      throw error;
    }
  }

  return Object.freeze({
    consumeExternalDefiCatalogueAccountReopenV1,
    consumeExternalDefiCatalogueKeeperReopenV1,
    consumeExternalDefiCatalogueGenerationReopenV1,
    consumeExternalDefiOfficialVaultReopenV1,
    consumeExternalDefiPrivateVaultExitReopenV1,
    consumeExternalDefiProtocolFixtureReopenV1,
    consumeExternalDefiCatalogueReopenV1,
    reopenOriginalDeviceExternalFlatAaveProtocolV1,
    retainExternalDefiCatalogueForReopenV1,
    reopenExternalDefiCatalogueFromRecoveryV1,
    retainExternalDefiVaultCatalogueForReopenV1,
    reopenExternalDefiVaultCatalogueFromRecoveryV1,
  });
}
