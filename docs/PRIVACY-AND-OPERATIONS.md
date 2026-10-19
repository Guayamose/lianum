# Security, privacy and operating boundaries

Lianum separates the authority to propose, approve, execute and observe a financial operation. Its security model depends on keeping those roles explicit across the mobile wallet, agent, API gateway, engine and underlying networks.

## Keys and authorization

Native wallet keys and the device identity are protected on the phone. Sensitive actions use device authentication and a review of the concrete operation. The agent has a separate proposer identity and never receives the owner's wallet signing key. A signed proposal is still subject to mobile preparation and approval.

Financial authorization binds the relevant plan, recipient, amount, dependencies, deadline and executor compensation. Operation lookup and background observation use their own scopes. A read grant is finite and does not imply permission to create a payment. The gateway authenticates the owner and enforces route-specific capabilities.

Mainnet and Testnet contexts remain explicit. Public acceptance recorded for this delivery concerns testnets. The presence of a mainnet wallet profile does not certify the entire engine or every DeFi operation for production funds.

## What privacy covers

Private notes, commitments and proof-bound transitions limit what the applicable ledger path must disclose. Proof artifacts and their consumers are checked against retained identities. These properties must be evaluated per protocol and execution path.

The current deployment is not a system-wide anonymity guarantee. RPC providers can observe network requests; the API and engine hosts process operation metadata; proof workers may access the private witnesses needed for their job. A local multi-role composition is not a deployment of independently operated parties. Native chain transfers retain their networks' public visibility.

The agent service stores owner-scoped conversation history, preferences, tasks and notification state in private SQLite storage. Model requests are processed by the configured provider. This deployment does not claim Zero Data Retention. Deleting a saved preference does not erase earlier messages or provider-side history. [The agent reference](../services/agent/README.md) describes bounded context, retention and cancellation behavior.

## Durable state and uncertain outcomes

An accepted financial operation keeps its original identity through lost responses and restarts. An uncertain result must be reconciled before a new action is considered. Retained journals, source bindings and recovery transitions prevent an HTTP timeout from being treated as permission to pay twice.

Unknown balances and unavailable valuations must remain visibly unknown. A journal entry, signed transaction or submitted proof is not final confirmation. The [evidence guide](VALIDATION.md) distinguishes submission, local verification and public confirmation.

PAEG settlement accounts for completed effects; it does not reverse transactions finalized on other chains. Recovery must follow the relevant operation's state and terms.

## Deployment and secrets

The current cloud deployment uses separate API/agent and engine services on Compute Engine. The agent gateway link is authenticated loopback HTTP on the API host; moving it to another machine requires an authenticated secure transport. Model keys, gateway tokens, private databases, custody backups and runtime state are excluded from Git.

Backups must retain the identity and state required by their original recovery route. A source checkout is not a custody backup. Runtime cleanup uses explicit regenerable paths; an entire `.local` directory is never assumed disposable.

Startup caching reuses anchored finalized public reads. Mutable balances, nonces and permissions are checked again. A cache hit is neither a financial authorization nor evidence that the current release has completed a public operation.

## Remaining security work

No external audit is claimed. Production expansion requires independent review of contracts and circuits, key and backup handling, host compromise assumptions, provider diversity, operational monitoring and each supported financial route. The [current status](../STATUS.md) identifies incomplete product paths; the [historical privacy assessment](history/2026-10-19/docs/PRIVACY-AND-OPERATIONS.md) retains earlier findings for provenance.
