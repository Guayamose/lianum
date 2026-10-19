# View of the product Lianum

The objectives, architecture and following requirements come from the full original view (historical path: `archive/delivery/PROJECT-VISION.md`). They're the scope of the product. Implementation status is at [STATUS.md](../../../STATUS.md) and pending work at [ROADMAP.md](../../../ROADMAP.md).

## Original vision and current scope

1. **Una wallet para siete redes.** Ethereum, Base, Arbitrum, BNB Chain, Solana,
Tron and Bitcoin must operate from a coherent experience and account. It is not enough to show your balances through RPC readers: the target includes the authorized flows of use, expenditure, reconciliation and recovery of each network.
2. **Default privacy.** Protect balances, positions, addresses,
strategies and routes. Both state and test information and correlations for quantities, timing, funding, withdrawals, PRC and networking must be addressed. An isolated ZK test does not automatically resolve system privacy.
3. **PAEG as a generic primitive of private graphs.** Express steps,
dependencies, authorizations, conditions and overall compliance. Each executor receives what is necessary for his part; the complete graph and its topology should not be exposed by default. Add combinations of steps or networks should reuse the relationship/verifier and evidence contracts, not require a different circuit for each route. The current profile has four slots; that size does not amount to arbitrarily large graphs.
4. ** Conditional liquidation and economic recovery.** Pay or release
reservations according to the overall result, prevent double charging and resolve timeout, partial deliveries, lost messages, unavailability and adverse events. Separate atomicity of the leadger, commitment/abortion of the protocol and economic result of the user by booking/solvers/recovery. A transaction from another already completed chain is not magically undone; losses, liquidity, commissions and solvency assumptions must be explicitly assigned.
5. **Real private fi composition.** Integrate shares and positions of
real protocols using graphs, with preservation, backup, authorizations and recovery. A transparent demo, observed balance or an estimate of exchange do not count on their own as a private composition or as assets available to spend.
6. **Coherent global private state.** Represent assets, notes, positions,
reserves and pending/finalized transactions with identity per asset and domain. Maintain durable states, detect obsolete data, reconcile the original effect and recover from restarts without doubling credits or shipments. Do not add separate asset units or present unknown data as zero balance or as available money.
7. **Real support of heterogeneous models.** Treat correctly EVM, SVM,
UTXO and Tron: network identity, finality, reorganisations, signatures, commissions, reception, observation and retry. The common interface must retain the security differences; format compatibility does not imply equivalent finality guarantees.
8. **External agent within reach.** The original vision included an agent,
But Rafa excluded all that part of our work on October 5, 2026. He will implement and integrate your agent. Our reach ends in Wallet, API, SDK, permissions and general documentation: it does not include agent, prompts, planner or autonomous logic. 100% of our work excludes that component.

## Target architecture

The destination is a maintenanceable corporate product, not an indefinite collection of test harnesses. The visual reference provided by the user is included in the low package `analysis-reference/` when available.

- **Mobile iOS/Android:** user root key custody, consent,
preparation of authorizations and recovery of your condition. Backend and workers should not receive those root keys.
- **wallet-platform in Google Cloud / Cloud Run:** modular monolith initially
drop down as a unit, with eight modules: API and permissions/limits/ idempotence; global private status and reserves; PAEG core; solvers, prices and limited execution; liquidation and recovery; chain adapters; DeFi adapters; and monitoring/operations.
- **Proof workers separated in Cloud Run Jobs:** Private entries limited to
each job/rol, explicit data contracts, programs and verification keys set, and absence of root user keys.
- **Support services:** Cloud SQL, Pub/Sub or Tasks, GSS storage
encryption and Secrets/KMS for infrastructure credentials. KMS does not replace mobile root key custody. The design includes life cycle, retention, reconciliation, observability and failure recovery.
- **Future external integration:** Rafa takes full care of his agent.
Wallet exposes general product interfaces, permissions and limits; we do not implement that consumer or its logic.

This is the objective architecture. Folders `mobile-core`, `wallet-platform` and `proof-workers` Currents represent code separations; they do not prove that there are native mobile apps, hostile isolation between processes or completed production deployment. It has not been authorized to spend or deploy GCP infrastructure simply because it is used as a target architecture.

## Six requirements that continue to guide construction

1. **Remaining code and functional documentation.** readable names and flows,
modules with clear responsibilities and documentation explaining what the system does, how it works and how it is used. The newspapers, hashes and test results are additional evidence, they do not replace that explanation. The legacy still needs work; a complete migration of the entire code is not affirmed.
2. **Real generality.** Commitments, relationships, verifiers and evidence
they must compose correctly, not just the coordinator. Preserve authorization, connection with graph, nullifiers, finality and recovery when adding operations.
3. ** Minimized confidence.** Replace the capacity of an issuer/authority
individual to invent SOL/BTC facts by cryptographic verification or by distributed mechanisms with threshold. Declaring who can lie, block, sign or guard; three keys on the same machine do not amount to three independent operators. Custody of a note and custody of the native asset are different things and should be reflected in the product.
4. ** System privacy.** Evaluate status and metadata information under
observers and explicit collusions. Do not use cosmetic decoys, hide audit data, or re-baptize a transparent path to declare privacy. Privacy waits/thresholds require consent and honest default behavior, without quietly switching to a less private option.
5. **Independent cryptographic review.** Prepare an implementation and
auditable material. Automatic tests and AI-assisted internal review are not an external cryptographic audit, nor shall they be submitted as such. This audit is still pending; this local work does not authorize recruitment, external contacts, publication or expenditure.
6. ** Performance as a design requirement.** Hot ambitious target:
Overhead own total less than 30 seconds, generation plus testing verification less than 20 seconds, coordination plus clearance less than 5 seconds and artificial waiting approximately zero. The native finality is measured separately. Load, hardware and causal path must be fixed; do not reduce confirmations or guarantees to appear to comply. The target is not yet reached and there is no complete hot measurement to prove it.

The agreed pace is to implement functional blocks, check what is affected and continue. Verifications of safety, preservation, recovery and expected behaviour are maintained; it is avoided to repeat campaigns unchanged by cosmetic changes or by a mistake of serialization of a harness.
