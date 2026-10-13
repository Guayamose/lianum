/** External DeFi recovery owns its original bootstrap and one-use part identities. */
import assert from 'node:assert/strict';
import { exactRecord } from '@lianum/components/encoding/commitments';
/**
 * @typedef {object} Head
 * @typedef {{metadata: {evmGenesis: string, chainId: string}, accounts: string[], block(): Promise<Head>, assertCanonical(head: Head): Promise<unknown>}} Runtime
 * @typedef {{hub: {address: string}, pools: {address: string, domain: unknown}[], registry: {keys: unknown[]}, verifiers: Record<string, {address: string}>}} System
 * @typedef {{deployments: {name: string, address: string, creationSHA256: string}[]}} Protocols
 * @typedef {{address: string, identity: {solver: string}, protocolKind: string, fee: unknown, creationTransactionHash: string}} Router
 * @typedef {{publicKey: unknown, close(): Promise<unknown>}} Operator
 * @typedef {{operators: Operator[]}} OperatorGroup
 * @typedef {{head: Head, schema?: string}} ActorRecord
 * @typedef {{profile: string, genesis: string, hub: string}} Identity
 * @typedef {{runtime: Runtime, system: System, protocols: Protocols, routers: readonly Router[], operatorGroup: OperatorGroup}} Actors
 * @typedef {{profile: string, genesis: string, chainId: string, runtimeAccounts: string[], operatorKeys: unknown[], hub: string, poolAddresses: string[], poolDomains: unknown[], verifierAddresses: Record<string, string>, protocolDeployments: {name: string, address: string, creationSHA256: string}[], routers: {identity: {solver: string}, protocolKind: string, fee: unknown, creationTransactionHash: string}[], externalProtocolAdmin: string, solver: string, providers: never[]}} Inventory
 * @typedef {{schema: 'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1', system: ActorRecord, protocols: ActorRecord, routers: ActorRecord[], head: Head, inventory: Inventory, operatorReceipt: unknown}} BootstrapRecord
 * @typedef {{schema: 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_STATE_V1', system: ActorRecord}} ExitRecord
 * @typedef {Actors & {identity: Identity, closed: boolean, sealed: boolean, handle: object, record: BootstrapRecord}} State
 * @typedef {{revision: number, commitment: string}} Checkpoint
 * @typedef {{profile: string, legacyDescriptorSHA256: string, registryCheckpoint: Checkpoint, partIdentitySHA256: string, partVersion: number}} LegacyBinding
 * @typedef {{schema: 'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2', hashProfile: string, legacyBinding: LegacyBinding | null, identity: Identity, stateSHA256: string, inventorySHA256: string}} BootstrapDescriptor
 * @typedef {{schema: 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_SECTION_V1', identity: Identity, stateSHA256: string, graphRecoveryEstablished: false}} ExitDescriptor
 * @typedef {{privateState: BootstrapRecord | ExitRecord, version: number, handle: object}} SavedPart
 * @typedef {{schema: string, protocols: ActorRecord, routers: ActorRecord[], router: ActorRecord, position: unknown}} GraphRecord
 * @typedef {{runtime: Runtime, record: ActorRecord, graph?: GraphRecord}} DeviceSystemRecord
 * @typedef {{runtime: Runtime, system: System, poolIndex: number, router: Router, protocolFixture: Protocols}} ObserverInput
 * @typedef {{reopenOwnedMetaMorphoGraphDeliveryBatchV4(token: object): Promise<object>,
 * createOwnedMorphoBluePositionGraphDeliveryObserverV1(input: {runtime: Runtime, system: System, poolIndex: number, router: Router, position: object}): Promise<object>,
 * createOwnedAaveStaticGraphDeliveryObserverV1(input: ObserverInput): Promise<object>,
 * createOwnedUniswapGraphDeliveryObserverV1(input: ObserverInput): Promise<object>,
 * createOwnedMetaMorphoGraphDeliveryObserverV1(input: ObserverInput): Promise<object>}} GraphObservers
 * @typedef {{recordSHA256(value: unknown): string,
 * runtime: {assertOwnedLocalEvmV2(runtime: Runtime): Promise<unknown>},
 * system: {assertOwnedFlatSystem(runtime: Runtime, system: System): unknown, captureOwnedFlatSystemRecoveryV1(runtime: Runtime, system: System): Promise<ActorRecord>, reopenOwnedFlatSystemRecoveryV1(token: object): Promise<System>},
 * protocols: {assertOfficialProtocolFixture(runtime: Runtime, protocols: Protocols): unknown, captureOfficialProtocolFixtureRecoveryV1(runtime: Runtime, protocols: Protocols): Promise<ActorRecord>, reopenOfficialProtocolFixtureRecoveryV1(token: object): Promise<Protocols>, reopenOriginalUniswapFixtureRecoveryV3(token: object): Promise<Protocols>},
 * routers: {assertOwnedPrivateExternalRouterV1(router: Router, expected: {runtime: Runtime, system: System, poolIndex: number}): unknown, captureOwnedPrivateExternalRouterRecoveryV1(router: Router): Promise<ActorRecord>, reopenOwnedPrivateExternalRouterRecoveryV1(token: object): Promise<Router>},
 * operators: {assertRetainedLocalFlatOperatorGroupV1(group: OperatorGroup, expected: {runtime: Runtime}): unknown, captureRetainedLocalFlatOperatorGroupV1(group: OperatorGroup): Promise<unknown>, reopenRetainedLocalFlatOperatorGroupV1(input: {runtime: Runtime, expected: unknown, bindings: null[]}): Promise<OperatorGroup>},
 * lifetime: {retainWrappedPrivateLifetimePartV1(runtime: Runtime, name: string, identity: Identity, record: BootstrapRecord | ExitRecord): Promise<object>, readWrappedPrivateLifetimePartV1(runtime: Runtime, name: string, identity: Identity): Promise<SavedPart>, updateWrappedPrivateLifetimePartV1(handle: object, record: BootstrapRecord): Promise<unknown>, assertWrappedPrivateLifetimePartSealedV1(handle: object): unknown, assertWrappedPrivateLifetimeAttemptV1(runtime: Runtime, identity: unknown): unknown, wrappedPrivateLifetimeRuntimeCheckpointV1(runtime: Runtime): Promise<Checkpoint>},
 * recovery: {retainOriginalWrappedRecoverySectionV1(token: object, name: string, record: BootstrapDescriptor | ExitDescriptor): Promise<unknown>, consumeOriginalWrappedRecoverySectionV1(token: object, name: string): BootstrapDescriptor | ExitDescriptor, originalWrappedRecoverySectionIdentityV1(token: object, name: string): unknown},
 * graph: {loadDeviceSystem(): Promise<{consumeOriginalDeviceExternalFlatSystemReopenV1(token: object): DeviceSystemRecord}>, loadAave(): Promise<{reopenOriginalDeviceExternalFlatAaveProtocolV1(token: object): Promise<Protocols>}>, loadObservers(): Promise<GraphObservers>, loadBluePosition(): Promise<{reopenOwnedOriginalMorphoBluePositionV1(token: object): Promise<object>}>, loadBlueRouter(): Promise<{reopenOwnedPrivateMorphoBluePositionRouterV1(token: object): Promise<Router>}>}}} ExternalBootstrapPorts
 */
/** @param {ExternalBootstrapPorts} ports */
export function buildExternalDefiBootstrapRecoveryV1(ports) {
  exactRecord(ports, [
    'recordSHA256',
    'runtime',
    'system',
    'protocols',
    'routers',
    'operators',
    'lifetime',
    'recovery',
    'graph',
  ]);
  assert.equal(typeof ports.recordSHA256, 'function');
  exactRecord(ports.runtime, ['assertOwnedLocalEvmV2']);
  for (const method of Object.values(ports.runtime)) assert.equal(typeof method, 'function');
  const { assertOwnedLocalEvmV2 } = ports.runtime;
  exactRecord(ports.system, [
    'assertOwnedFlatSystem',
    'captureOwnedFlatSystemRecoveryV1',
    'reopenOwnedFlatSystemRecoveryV1',
  ]);
  for (const method of Object.values(ports.system)) assert.equal(typeof method, 'function');
  const {
    assertOwnedFlatSystem,
    captureOwnedFlatSystemRecoveryV1,
    reopenOwnedFlatSystemRecoveryV1,
  } = ports.system;
  exactRecord(ports.protocols, [
    'assertOfficialProtocolFixture',
    'captureOfficialProtocolFixtureRecoveryV1',
    'reopenOfficialProtocolFixtureRecoveryV1',
    'reopenOriginalUniswapFixtureRecoveryV3',
  ]);
  for (const method of Object.values(ports.protocols)) assert.equal(typeof method, 'function');
  const {
    assertOfficialProtocolFixture,
    captureOfficialProtocolFixtureRecoveryV1,
    reopenOfficialProtocolFixtureRecoveryV1,
    reopenOriginalUniswapFixtureRecoveryV3,
  } = ports.protocols;
  exactRecord(ports.routers, [
    'assertOwnedPrivateExternalRouterV1',
    'captureOwnedPrivateExternalRouterRecoveryV1',
    'reopenOwnedPrivateExternalRouterRecoveryV1',
  ]);
  for (const method of Object.values(ports.routers)) assert.equal(typeof method, 'function');
  const {
    assertOwnedPrivateExternalRouterV1,
    captureOwnedPrivateExternalRouterRecoveryV1,
    reopenOwnedPrivateExternalRouterRecoveryV1,
  } = ports.routers;
  exactRecord(ports.operators, [
    'assertRetainedLocalFlatOperatorGroupV1',
    'captureRetainedLocalFlatOperatorGroupV1',
    'reopenRetainedLocalFlatOperatorGroupV1',
  ]);
  for (const method of Object.values(ports.operators)) assert.equal(typeof method, 'function');
  const {
    assertRetainedLocalFlatOperatorGroupV1,
    captureRetainedLocalFlatOperatorGroupV1,
    reopenRetainedLocalFlatOperatorGroupV1,
  } = ports.operators;
  exactRecord(ports.lifetime, [
    'retainWrappedPrivateLifetimePartV1',
    'readWrappedPrivateLifetimePartV1',
    'updateWrappedPrivateLifetimePartV1',
    'assertWrappedPrivateLifetimePartSealedV1',
    'assertWrappedPrivateLifetimeAttemptV1',
    'wrappedPrivateLifetimeRuntimeCheckpointV1',
  ]);
  for (const method of Object.values(ports.lifetime)) assert.equal(typeof method, 'function');
  const {
    retainWrappedPrivateLifetimePartV1,
    readWrappedPrivateLifetimePartV1,
    updateWrappedPrivateLifetimePartV1,
    assertWrappedPrivateLifetimePartSealedV1,
    assertWrappedPrivateLifetimeAttemptV1,
    wrappedPrivateLifetimeRuntimeCheckpointV1,
  } = ports.lifetime;
  exactRecord(ports.recovery, [
    'retainOriginalWrappedRecoverySectionV1',
    'consumeOriginalWrappedRecoverySectionV1',
    'originalWrappedRecoverySectionIdentityV1',
  ]);
  for (const method of Object.values(ports.recovery)) assert.equal(typeof method, 'function');
  const {
    retainOriginalWrappedRecoverySectionV1,
    consumeOriginalWrappedRecoverySectionV1,
    originalWrappedRecoverySectionIdentityV1,
  } = ports.recovery;
  exactRecord(ports.graph, [
    'loadDeviceSystem',
    'loadAave',
    'loadObservers',
    'loadBluePosition',
    'loadBlueRouter',
  ]);
  for (const method of Object.values(ports.graph)) assert.equal(typeof method, 'function');
  const { loadDeviceSystem, loadAave, loadObservers, loadBluePosition, loadBlueRouter } =
    ports.graph;
  /** @type {WeakMap<object, State>} */ const owned = new WeakMap();
  /** @type {WeakMap<object, {kind: string, value: unknown}>} */ const parts = new WeakMap();
  const SLOT = 'custody-bootstrap';
  const sha = ports.recordSHA256;
  /** @param {Runtime} runtime @param {object} token */
  function assertSameAttempt(runtime, token) {
    assertWrappedPrivateLifetimeAttemptV1(
      runtime,
      originalWrappedRecoverySectionIdentityV1(token, 'system'),
    );
  }
  /** @param {Runtime} runtime @param {System} system */
  function identity(runtime, system) {
    return {
      profile: 'EXTERNAL_DEFI_BOOTSTRAP_RECOVERY_V1',
      genesis: runtime.metadata.evmGenesis,
      hub: system.hub.address,
    };
  }
  /** @param {Actors} s */
  function assertActors(s) {
    assertOwnedFlatSystem(s.runtime, s.system);
    assertOfficialProtocolFixture(s.runtime, s.protocols);
    assertRetainedLocalFlatOperatorGroupV1(s.operatorGroup, { runtime: s.runtime });
    assert.equal(s.routers.length, 2);
    assert.equal(s.system.pools.length, 2);
    assert.equal(s.operatorGroup.operators.length, 4);
    assert.deepEqual(
      s.operatorGroup.operators.map((o) => o.publicKey),
      s.system.registry.keys,
      'ORIGINAL_OPERATOR_REGISTRY',
    );
    for (let poolIndex = 0; poolIndex < 2; poolIndex++) {
      assertOwnedPrivateExternalRouterV1(s.routers[poolIndex], {
        runtime: s.runtime,
        system: s.system,
        poolIndex,
      });
      assert.equal(s.routers[poolIndex].identity.solver, s.runtime.accounts[0].slice(2));
    }
    assert.equal(s.routers[0].protocolKind, 'UNISWAP_V3_EXACT_OUTPUT_SINGLE');
    assert.equal(s.routers[1].protocolKind, 'METAMORPHO_V1_EXACT_SHARE_MINT');
  }
  /** @param {Actors} s */
  function inventory(s) {
    assertActors(s);
    return {
      profile: 'EXTERNAL_DEFI_BOOTSTRAP_ACTORS_V1',
      genesis: s.runtime.metadata.evmGenesis,
      chainId: s.runtime.metadata.chainId,
      runtimeAccounts: [...s.runtime.accounts],
      operatorKeys: s.operatorGroup.operators.map((o) => structuredClone(o.publicKey)),
      hub: s.system.hub.address,
      poolAddresses: s.system.pools.map((p) => p.address),
      poolDomains: s.system.pools.map((p) => structuredClone(p.domain)),
      verifierAddresses: Object.fromEntries(
        Object.entries(s.system.verifiers).map(([role, v]) => [role, v.address]),
      ),
      protocolDeployments: s.protocols.deployments.map((p) => ({
        name: p.name,
        address: p.address,
        creationSHA256: p.creationSHA256,
      })),
      routers: s.routers.map((r) => ({
        identity: structuredClone(r.identity),
        protocolKind: r.protocolKind,
        fee: r.fee,
        creationTransactionHash: r.creationTransactionHash,
      })),
      externalProtocolAdmin: s.runtime.accounts[0],
      solver: s.runtime.accounts[0],
      providers: [],
    };
  }
  /** @param {Actors} s @returns {Promise<BootstrapRecord>} */
  async function snapshot(s) {
    assertActors(s);
    await assertOwnedLocalEvmV2(s.runtime);
    const head = await s.runtime.block();
    const system = await captureOwnedFlatSystemRecoveryV1(s.runtime, s.system),
      protocols = await captureOfficialProtocolFixtureRecoveryV1(s.runtime, s.protocols),
      routers = [];
    for (const router of s.routers)
      routers.push(await captureOwnedPrivateExternalRouterRecoveryV1(router));
    for (const record of [system, protocols, ...routers])
      assert.deepEqual(record.head, head, 'SAME_ORIGINAL_BOOTSTRAP_HEAD');
    await s.runtime.assertCanonical(head);
    assert.deepEqual(await s.runtime.block(), head);
    return {
      schema: 'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1',
      system,
      protocols,
      routers,
      head: structuredClone(head),
      inventory: inventory(s),
      operatorReceipt: null,
    };
  }
  /** @param {State} s */
  function issue(s) {
    const bootstrap = Object.freeze({
      runtime: s.runtime,
      system: s.system,
      protocols: s.protocols,
      routers: Object.freeze([...s.routers]),
      operatorGroup: s.operatorGroup,
      inventory: () => {
        assert.ok(!s.closed && !s.sealed);
        return structuredClone(inventory(s));
      },
      close: async () => {
        if (s.closed) return { closed: true };
        s.sealed = true;
        const results = await Promise.allSettled(s.operatorGroup.operators.map((o) => o.close()));
        s.closed = true;
        const errors = results.filter((x) => x.status === 'rejected');
        if (errors.length)
          throw new AggregateError(
            errors.map((x) => x.reason),
            'EXTERNAL_BOOTSTRAP_OPERATOR_CLOSE',
          );
        return { closed: true };
      },
    });
    owned.set(bootstrap, s);
    return bootstrap;
  }
  /** @param {Actors} input */
  async function createExternalDefiBootstrapRecoveryV1(input) {
    exactRecord(input, ['runtime', 'system', 'protocols', 'routers', 'operatorGroup']);
    assertActors(input);
    const id = identity(input.runtime, input.system),
      record = await snapshot(input);
    const handle = await retainWrappedPrivateLifetimePartV1(input.runtime, SLOT, id, record);
    assertWrappedPrivateLifetimePartSealedV1(handle);
    return issue({ ...input, identity: id, record, handle, closed: false, sealed: false });
  }
  /** @param {{runtime: Runtime, bootstrap: ReturnType<issue>, attemptAuthority: object}} input */
  async function retainExternalDefiBootstrapForReopenV1(input) {
    exactRecord(input, ['runtime', 'bootstrap', 'attemptAuthority']);
    const s = owned.get(input.bootstrap);
    assert.ok(s && !s.closed && !s.sealed);
    assert.equal(s.runtime, input.runtime);
    s.sealed = true;
    assertSameAttempt(input.runtime, input.attemptAuthority);
    try {
      const current = await s.runtime.block();
      const record =
        JSON.stringify(current) === JSON.stringify(s.record.head)
          ? structuredClone(s.record)
          : await snapshot(s);
      assert.deepEqual(record.inventory, inventory(s), 'ORIGINAL_BOOTSTRAP_INVENTORY');
      record.operatorReceipt = await captureRetainedLocalFlatOperatorGroupV1(s.operatorGroup);
      s.closed = true;
      await updateWrappedPrivateLifetimePartV1(s.handle, record);
      assertWrappedPrivateLifetimePartSealedV1(s.handle);
      s.record = record;
      await s.runtime.assertCanonical(record.head);
      assert.deepEqual(await s.runtime.block(), record.head);
      await retainOriginalWrappedRecoverySectionV1(input.attemptAuthority, 'system', {
        schema: 'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2',
        hashProfile: 'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1',
        legacyBinding: null,
        identity: s.identity,
        stateSHA256: sha(record),
        inventorySHA256: sha(record.inventory),
      });
      return { retained: true, originalResourcesStopped: true };
    } catch (error) {
      try {
        await input.bootstrap.close();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'EXTERNAL_BOOTSTRAP_CAPTURE_CLEANUP');
      }
      throw error;
    }
  }
  /** @param {unknown} value @param {string} kind */
  function part(value, kind) {
    const token = Object.freeze(Object.create(null));
    parts.set(token, { kind, value });
    return token;
  }
  /** @param {object} token @param {string} kind */
  function consumeExternalDefiBootstrapPartV1(token, kind) {
    const row = parts.get(token);
    assert.ok(row && row.kind === kind, 'ORIGINAL_EXTERNAL_BOOTSTRAP_PART');
    parts.delete(token);
    return row.value;
  }
  /** @param {{descriptor: BootstrapDescriptor, state: BootstrapRecord, partVersion: number, registryCheckpoint: Checkpoint | null}} input */
  function assertCanonicalExternalBootstrapSectionV2(input) {
    exactRecord(input, ['descriptor', 'state', 'partVersion', 'registryCheckpoint']);
    const { descriptor, state: r } = input;
    exactRecord(descriptor, [
      'schema',
      'hashProfile',
      'legacyBinding',
      'identity',
      'stateSHA256',
      'inventorySHA256',
    ]);
    assert.ok(descriptor.schema === 'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2');
    assert.equal(descriptor.hashProfile, 'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1');
    assert.equal(sha(r), descriptor.stateSHA256);
    assert.equal(sha(r.inventory), descriptor.inventorySHA256);
    if (descriptor.legacyBinding !== null) {
      const binding = descriptor.legacyBinding;
      exactRecord(binding, [
        'profile',
        'legacyDescriptorSHA256',
        'registryCheckpoint',
        'partIdentitySHA256',
        'partVersion',
      ]);
      assert.equal(binding.profile, 'AUTHENTICATED_V1_TO_CANONICAL_BOOTSTRAP_V2');
      assert.match(binding.legacyDescriptorSHA256, /^[0-9a-f]{64}$/);
      assert.equal(binding.partIdentitySHA256, sha(descriptor.identity));
      assert.equal(binding.partVersion, input.partVersion);
      exactRecord(binding.registryCheckpoint, ['revision', 'commitment']);
      assert.ok(
        Number.isSafeInteger(binding.registryCheckpoint.revision) &&
          binding.registryCheckpoint.revision >= 0,
      );
      assert.match(binding.registryCheckpoint.commitment, /^[0-9a-f]{64}$/);
      assert.deepEqual(
        input.registryCheckpoint,
        binding.registryCheckpoint,
        'ORIGINAL_CANONICAL_MIGRATION_CHECKPOINT',
      );
    }
    return undefined;
  }

  /** @param {{runtime: Runtime, attemptAuthority: object}} input */
  async function reopenExternalDefiBootstrapFromAuthorityV1(input) {
    exactRecord(input, ['runtime', 'attemptAuthority']);
    const { runtime } = input;
    await assertOwnedLocalEvmV2(runtime);
    assertSameAttempt(input.runtime, input.attemptAuthority);
    const descriptor = consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority, 'system');
    exactRecord(descriptor, [
      'schema',
      'hashProfile',
      'legacyBinding',
      'identity',
      'stateSHA256',
      'inventorySHA256',
    ]);
    assert.ok(descriptor.schema === 'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2');
    assert.equal(descriptor.hashProfile, 'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1');
    assert.equal(descriptor.identity.profile, 'EXTERNAL_DEFI_BOOTSTRAP_RECOVERY_V1');
    assert.equal(descriptor.identity.genesis, runtime.metadata.evmGenesis);
    const saved = await readWrappedPrivateLifetimePartV1(runtime, SLOT, descriptor.identity),
      r = saved.privateState;
    assert.ok(r.schema === 'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1');
    assertCanonicalExternalBootstrapSectionV2({
      descriptor,
      state: r,
      partVersion: saved.version,
      registryCheckpoint:
        descriptor.legacyBinding === null
          ? null
          : await wrappedPrivateLifetimeRuntimeCheckpointV1(runtime),
    });
    exactRecord(r, [
      'schema',
      'system',
      'protocols',
      'routers',
      'head',
      'inventory',
      'operatorReceipt',
    ]);
    assert.ok(r.schema === 'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1');
    assert.equal(r.routers.length, 2);
    assert.ok(r.operatorReceipt);
    assert.deepEqual(await runtime.block(), r.head);
    let operatorGroup = null;
    try {
      const protocols = await reopenOfficialProtocolFixtureRecoveryV1(
        part({ runtime, record: r.protocols }, 'protocols'),
      );
      const system = await reopenOwnedFlatSystemRecoveryV1(
        part({ runtime, record: r.system }, 'system'),
      );
      assert.equal(system.hub.address, descriptor.identity.hub);
      const routers = [];
      for (const record of r.routers)
        routers.push(
          await reopenOwnedPrivateExternalRouterRecoveryV1(
            part({ runtime, record, system, protocols }, 'router'),
          ),
        );
      operatorGroup = await reopenRetainedLocalFlatOperatorGroupV1({
        runtime,
        expected: r.operatorReceipt,
        bindings: [null, null, null, null],
      });
      const s = {
        runtime,
        system,
        protocols,
        routers,
        operatorGroup,
        identity: descriptor.identity,
        handle: saved.handle,
        record: r,
        closed: false,
        sealed: false,
      };
      assertActors(s);
      assert.deepEqual(inventory(s), r.inventory, 'ORIGINAL_REOPENED_ACTOR_INVENTORY');
      await runtime.assertCanonical(r.head);
      assert.deepEqual(await runtime.block(), r.head);
      return issue(s);
    } catch (error) {
      if (operatorGroup) await Promise.allSettled(operatorGroup.operators.map((o) => o.close()));
      throw error;
    }
  }

  /** Separate finite system section for an EXIT-only catalogue continuation.
   * Uses the full original system producer/consumer, never protocol/GRAPH actors.
   * Original runtime and owner processes remain their own ordered sections. */
  /** @param {{runtime: Runtime, system: System, attemptAuthority: object}} input */
  async function retainExternalDefiVaultExitSystemForReopenV1(input) {
    assert.equal(arguments.length, 1);
    exactRecord(input, ['runtime', 'system', 'attemptAuthority']);
    const { runtime, system, attemptAuthority } = input;
    assertSameAttempt(runtime, attemptAuthority);
    assertOwnedFlatSystem(runtime, system);
    const head = await runtime.block(),
      record = await captureOwnedFlatSystemRecoveryV1(runtime, system);
    assert.deepEqual(record.head, head);
    await runtime.assertCanonical(head);
    assert.deepEqual(await runtime.block(), head);
    const id = {
      profile: 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_LIFETIME_V1',
      genesis: runtime.metadata.evmGenesis,
      hub: system.hub.address,
    };
    /** @type {ExitRecord} */ const state = {
      schema: 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_STATE_V1',
      system: record,
    };
    const handle = await retainWrappedPrivateLifetimePartV1(runtime, SLOT, id, state);
    assertWrappedPrivateLifetimePartSealedV1(handle);
    await retainOriginalWrappedRecoverySectionV1(attemptAuthority, 'system', {
      schema: 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_SECTION_V1',
      identity: id,
      stateSHA256: sha(state),
      graphRecoveryEstablished: false,
    });
    return { retained: true, originalResourcesStopped: true };
  }
  /** @param {{runtime: Runtime, attemptAuthority: object}} input */
  async function reopenExternalDefiVaultExitSystemFromAuthorityV1(input) {
    assert.equal(arguments.length, 1);
    exactRecord(input, ['runtime', 'attemptAuthority']);
    const { runtime, attemptAuthority } = input;
    await assertOwnedLocalEvmV2(runtime);
    assertSameAttempt(runtime, attemptAuthority);
    const d = consumeOriginalWrappedRecoverySectionV1(attemptAuthority, 'system');
    exactRecord(d, ['schema', 'identity', 'stateSHA256', 'graphRecoveryEstablished']);
    assert.ok(d.schema === 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_SECTION_V1');
    assert.equal(d.graphRecoveryEstablished, false);
    assert.equal(d.identity.profile, 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_LIFETIME_V1');
    assert.equal(d.identity.genesis, runtime.metadata.evmGenesis);
    const saved = await readWrappedPrivateLifetimePartV1(runtime, SLOT, d.identity),
      state = saved.privateState;
    exactRecord(state, ['schema', 'system']);
    assert.ok(state.schema === 'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_STATE_V1');
    assert.equal(sha(state), d.stateSHA256);
    assertWrappedPrivateLifetimePartSealedV1(saved.handle);
    const system = await reopenOwnedFlatSystemRecoveryV1(
      part({ runtime, record: state.system }, 'system'),
    );
    assertOwnedFlatSystem(runtime, system);
    assert.equal(system.hub.address, d.identity.hub);
    assert.deepEqual(await runtime.block(), state.system.head);
    await runtime.assertCanonical(state.system.head);
    return Object.freeze({
      runtime,
      system,
      graphRecoveryEstablished: false,
      close: async () => ({ closed: true }),
    });
  }

  /** Distinct original DeviceExternalFlat token, same full System opener. */
  /** @param {object} token */
  async function reopenOriginalDeviceExternalFlatSystemRecordV1(token) {
    assert.equal(arguments.length, 1);
    const module = await loadDeviceSystem();
    const { runtime, record } = module.consumeOriginalDeviceExternalFlatSystemReopenV1(token);
    const system = await reopenOwnedFlatSystemRecoveryV1(part({ runtime, record }, 'system'));
    assertOwnedFlatSystem(runtime, system);
    return system;
  }

  /** @param {object} token */
  async function reopenOriginalDeviceExternalFlatGraphSystemRecordV1(token) {
    assert.equal(arguments.length, 1);
    const module = await loadDeviceSystem();
    const { runtime, record, graph } =
      module.consumeOriginalDeviceExternalFlatSystemReopenV1(token);
    assert.ok(graph, 'DEVICE_EXTERNAL_GRAPH_ORIGINAL_SYSTEM_TOKEN');
    const aave = graph.schema === 'DEVICE_AAVE_STATIC_GRAPH_SYSTEM_PRIVATE_V1',
      protocolToken = part({ runtime, record: graph.protocols }, 'protocols');
    const protocols = aave
        ? await (await loadAave()).reopenOriginalDeviceExternalFlatAaveProtocolV1(protocolToken)
        : await reopenOfficialProtocolFixtureRecoveryV1(protocolToken),
      system = await reopenOwnedFlatSystemRecoveryV1(part({ runtime, record }, 'system'));
    assertOwnedFlatSystem(runtime, system);
    if (graph.schema === 'DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_SYSTEM_PRIVATE_V4') {
      const routers = [];
      for (const record of graph.routers) {
        const router = await reopenOwnedPrivateExternalRouterRecoveryV1(
          part({ runtime, record, system, protocols }, 'router'),
        );
        assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
        assert.equal(router.protocolKind, 'METAMORPHO_V1_EXACT_SHARE_MINT');
        routers.push(router);
      }
      assert.ok(routers.length >= 2 && routers.length <= 4);
      assert.equal(new Set(routers.map((r) => r.address)).size, routers.length);
      const { reopenOwnedMetaMorphoGraphDeliveryBatchV4 } = await loadObservers();
      const deliveryObserver = await reopenOwnedMetaMorphoGraphDeliveryBatchV4(
        part({ runtime, system, protocolFixture: protocols, routers }, 'meta-batch'),
      );
      return Object.freeze({
        system,
        protocols,
        router: routers[0],
        routers: Object.freeze(routers),
        deliveryObserver,
      });
    }
    if (graph.schema === 'DEVICE_MORPHO_BLUE_GRAPH_SYSTEM_PRIVATE_V1') {
      const { reopenOwnedOriginalMorphoBluePositionV1 } = await loadBluePosition();
      const position = await reopenOwnedOriginalMorphoBluePositionV1(
        part({ runtime, protocols, record: graph.position }, 'blue-position'),
      );
      const { reopenOwnedPrivateMorphoBluePositionRouterV1 } = await loadBlueRouter();
      const router = await reopenOwnedPrivateMorphoBluePositionRouterV1(
        part({ runtime, record: graph.router, system, protocols, position }, 'blue-router'),
      );
      assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
      assert.equal(router.protocolKind, 'MORPHO_BLUE_V1_EXACT_SHARE_SUPPLY');
      const { createOwnedMorphoBluePositionGraphDeliveryObserverV1 } = await loadObservers();
      const deliveryObserver = await createOwnedMorphoBluePositionGraphDeliveryObserverV1({
        runtime,
        system,
        poolIndex: 1,
        router,
        position,
      });
      return Object.freeze({ system, protocols, router, position, deliveryObserver });
    }
    if (aave) {
      const router = await reopenOwnedPrivateExternalRouterRecoveryV1(
        part({ runtime, record: graph.router, system, protocols }, 'router'),
      );
      assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
      assert.equal(router.protocolKind, 'AAVE_V3_STATIC_EXACT_SHARE_MINT');
      const { createOwnedAaveStaticGraphDeliveryObserverV1 } = await loadObservers();
      const deliveryObserver = await createOwnedAaveStaticGraphDeliveryObserverV1({
        runtime,
        system,
        poolIndex: 1,
        router,
        protocolFixture: protocols,
      });
      return Object.freeze({ system, protocols, router, deliveryObserver });
    }
    if (graph.schema === 'DEVICE_UNISWAP_GRAPH_SYSTEM_PRIVATE_V1') {
      const router = await reopenOwnedPrivateExternalRouterRecoveryV1(
        part({ runtime, record: graph.router, system, protocols }, 'router'),
      );
      assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
      assert.equal(router.protocolKind, 'UNISWAP_V3_EXACT_OUTPUT_SINGLE');
      const { createOwnedUniswapGraphDeliveryObserverV1 } = await loadObservers();
      const deliveryObserver = await createOwnedUniswapGraphDeliveryObserverV1({
        runtime,
        system,
        poolIndex: 1,
        router,
        protocolFixture: protocols,
      });
      return Object.freeze({ system, protocols, router, deliveryObserver });
    }
    assert.equal(graph.schema, 'DEVICE_EXTERNAL_FLAT_GRAPH_SYSTEM_PRIVATE_V1');
    const router = await reopenOwnedPrivateExternalRouterRecoveryV1(
      part({ runtime, record: graph.router, system, protocols }, 'router'),
    );
    assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
    assert.equal(router.protocolKind, 'METAMORPHO_V1_EXACT_SHARE_MINT');
    const { createOwnedMetaMorphoGraphDeliveryObserverV1 } = await loadObservers();
    const deliveryObserver = await createOwnedMetaMorphoGraphDeliveryObserverV1({
      runtime,
      system,
      poolIndex: 1,
      router,
      protocolFixture: protocols,
    });
    return Object.freeze({ system, protocols, router, deliveryObserver });
  }

  /** Private mechanical opener; the façade first consumes an original Mixed
   * supervisor component. Its part tokens never leave this closed builder. */
  /** @param {{runtime: Runtime, record: {profile: string, targetDescriptor: unknown, bootstrap: {system: ActorRecord, protocols: ActorRecord, router: ActorRecord}, account: unknown}}} input */
  async function reopenPagedUniswapBootstrapPartsV3(input) {
    assert.equal(arguments.length, 1);
    exactRecord(input, ['runtime', 'record']);
    const { runtime, record } = input;
    assert.equal(record.profile, 'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3');
    await assertOwnedLocalEvmV2(runtime);
    exactRecord(record.bootstrap, ['system', 'protocols', 'router']);
    assert.deepEqual(record.bootstrap.system.head, record.bootstrap.protocols.head);
    assert.deepEqual(record.bootstrap.system.head, record.bootstrap.router.head);
    await runtime.assertCanonical(record.bootstrap.system.head);
    assert.equal(record.bootstrap.protocols.schema,'ORIGINAL_UNISWAP_ONLY_PROTOCOL_FIXTURE_V3');
    const protocols = await reopenOriginalUniswapFixtureRecoveryV3(part({ runtime, record: record.bootstrap.protocols }, 'uniswap-protocols-v3'));
    const system = await reopenOwnedFlatSystemRecoveryV1(part({ runtime, record: record.bootstrap.system }, 'system'));
    const router = await reopenOwnedPrivateExternalRouterRecoveryV1(part({ runtime, record: record.bootstrap.router, system, protocols }, 'router'));
    assertOwnedFlatSystem(runtime, system);
    assertOfficialProtocolFixture(runtime, protocols);
    assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex: 1 });
    assert.equal(router.protocolKind, 'UNISWAP_V3_EXACT_OUTPUT_SINGLE');
    const { createOwnedUniswapGraphDeliveryObserverV1 } = await loadObservers();
    const deliveryObserver = await createOwnedUniswapGraphDeliveryObserverV1({ runtime, system, poolIndex: 1, router, protocolFixture: protocols });
    return Object.freeze({ runtime, system, protocols, router, deliveryObserver,
      accountToken: part({ runtime, system, router, deliveryObserver, saved: record.account }, 'paged-uniswap-private-share'),
      retained: record });
  }

  return Object.freeze({
    createExternalDefiBootstrapRecoveryV1,
    retainExternalDefiBootstrapForReopenV1,
    consumeExternalDefiBootstrapPartV1,
    assertCanonicalExternalBootstrapSectionV2,
    reopenExternalDefiBootstrapFromAuthorityV1,
    retainExternalDefiVaultExitSystemForReopenV1,
    reopenExternalDefiVaultExitSystemFromAuthorityV1,
    reopenOriginalDeviceExternalFlatSystemRecordV1,
    reopenOriginalDeviceExternalFlatGraphSystemRecordV1,
    reopenPagedUniswapBootstrapPartsV3,
  });
}
