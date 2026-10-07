# Integrated local wallet application

This application joins the active account, native-claim journal, native-network
read adapters and private-share exit service behind one loopback server and one
manual browser workflow. It does not create fake balances or silently start a
native fixture. It is an application integration, not a finished mobile wallet.

## Version and acceptance boundary (2026-10-06)

The installed core is the closed raw V4 claim lifecycle plus append-only pool
routing (core42). The wrapped custody, GRAPH and same-app withdrawal changes
are sealed, **uninstalled source candidates**. Sections marked wrapped below
specify that candidate contract; they do not mean the installed application can
construct or run it. A proposed API is not native/proof or release acceptance.
The actual coupled wrapped constructors still refuse
`WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT`; the withdrawal release literals are
null and its constructor refuses `WRAPPED_WITHDRAWAL_NOT_RELEASED`. Never replace
missing artifacts, enable release constants ad hoc, or weaken source pins,
original-head checks, complete-round freshness, or finality guards to follow an
example.

## Run the disconnected application

From `flat-wallet`, using the pinned Node runtime:

```sh
env -u NODE_OPTIONS -u NODE_PATH node wallet-app/run.mjs
```

Open the exact `http://127.0.0.1:<port>` origin printed by the process. No command
line options, remote listener or browser-supplied bootstrap configuration are
accepted. The initial state is `DISCONNECTED`, with unknown balances `null` and
all effectful capabilities disabled. Stopping the listener does not cancel or
close an original wallet session, native node or durable admitted job.

## Bind genuine resources privately

The trusted application bootstrap imports `startWalletApplication` from
`server.mjs`. It supplies original in-process branded capabilities, not copied
objects, serialized sessions, private keys or HTTP configuration:

```js
const app = await startWalletApplication({
  actionAccessMode: 'exact-only', // no broad bearer in this local UI
  accountSession,       // original FlatAccountSession, optional
  nativeClaimSession,   // original owner/domain-scoped NativeClaimSession, optional
  defiExit: { runtime, service }, // original owned private-share exit service, optional
  networkConfig: {
    networks,           // fixed trusted endpoint/genesis descriptors
    accounts,           // fixed [{ chain, address }] owner associations
  },
});
```

Omit unbound optional sections. These variables must already come from the
existing trusted lifecycle; this example is not a wallet/session factory.
Alternatively, start disconnected and call `app.bindSessions({...})` once from
that same private process. Rebinding, browser-selected addresses/RPC endpoints,
arbitrary signing and root-key input are not supported.

The native session requires its original owner-prepared deposit handoff and
surviving keeper/controller resources. Its redemption acts on its fixed claim
domain and requires the original owner release; an available private note does
not by itself make an external wrapper balance redeemable. One native session
is bound per application. The DeFi service requires an already-confirmed
original share-note EXIT before redemption preparation. The manual account
workflow can execute an already-authorized EXIT, but the browser cannot create
its owner authorization or choose a new recipient/share quantity.

`nativeClaimSessionIdentity(session)` captures the unique original registered
claim domain before the session takes its controller lease or writes its journal.
The authenticated app state includes that fixed BTC/SOL asset, genesis, domain
and atomic unit under `nativeClaims.identity`. It is configuration metadata, not
a fresh custody observation or a private portfolio asset ID. The action form and
immutable review use this identity rather than a ticker or portfolio position.
Deposit, redemption, refund and resume fail closed without it; reconciliation
still follows the original request and fresh journal capability. Existing native
snapshot/owner schemas and action bodies remain unchanged.

The five optional HTTP adapters cover native-holdings reads for Ethereum, Base,
Arbitrum, BNB and Tron. Configuration does not establish live connectivity.
Observations remain trusted-RPC data, never a new private credit or permission
to spend. Private native execution on these five networks is still open work.
See `../docs/http-portfolio-registry.md` for the exact configuration contract.

## HTTP and lifecycle contract

`GET /api/wallet/state` exposes one owner-scoped projection. The server holds
reads and admissions apart. It checks bound original account and native-claim journals (and, in the sealed
wrapped candidate, the withdrawal journal) before owner/custody/DeFi views or
mutations; an active job or an
unreadable journal blocks conflicting work. Unknown, busy or failed observations stay unavailable.
There is no cache that converts a prior balance into current authorization.

The ordinary account actions are prepare, execute and reconcile. Preparation
binds an original owner-prepared TOP_UP or EXIT reference and asset identity;
it creates neither the owner authorization nor a browser-selected amount or
destination. Execution requires the original PREPARED request. The server checks
the current stored kind as well as incoming preparation, so GRAPH cannot be
smuggled through an existing request ID. The registered manual GRAPH extension
below adds original-only recovery; arbitrary GRAPH and coordinator restart
remain outside HTTP.

Account HTTP 200 uses `FLAT_ACCOUNT_VOLATILE_ADMISSION_V1`, with
`acceptance: VOLATILE_UI_QUEUE_ONLY`, `durableAdmissionEstablished: false` and
`settlementEstablished: false`. It acknowledges the original session's local
queue only. The queued work may later fail, and interruption before journal
persistence can lose that admission. Retain the original account request ID,
refresh manually and reconcile the original operation. Do not treat an
admission marked SUCCEEDED as settlement evidence or create a replacement on a
lost response. Account, native and DeFi request identities remain separate.

The fixed native actions are deposit, redeem, refund, reconcile and resume.
HTTP 202 confirms durable admission only. Keep the original request ID and
reconcile it after a lost response; do not submit a replacement transfer.
The fixed DeFi actions are prepare, requote, execute, reconcile and reopen.
Their HTTP 200 response is a service state, not private credit. Successfully
redeemed underlying is held at the original external owner address.

Read `UI.md` for request shapes, recovery fences and review/confirm behavior.
The UI has no automatic retry, polling, resume or execution. General graph
execution is disabled; the registered manual extension has separate authority.

The listener accepts the exact loopback Host and bounded authenticated routes.
POST requires same-origin plus a separate random action token. State reads
require the owner token and original Origin or the browser's same-origin fetch
signal. HTML supplies ephemeral tokens, which the UI immediately removes from
the DOM and retains only in memory. They are not root/spend keys. This is a
trusted-host local profile, not protection against a compromised host or
authorized same-origin script. TLS/public deployment and independent operator
isolation are not established by this application.

## Historical host checks and current acceptance

The 2026-10-05 check exercises real loopback HTTP against the actual app server,
fixed-route UI behavior and concrete five-network transports pointed at an
owned synthetic HTTP fixture. Native sessions and the DeFi capability in these
host checks are explicit fixtures; the checks do not establish native funds or
proof acceptance. Source hashes and scope are in `server-test-evidence.json`.

```sh
node --experimental-test-module-mocks --test wallet-app/server.test.mjs wallet-app/ui.test.mjs
```

Acceptance remains scoped to each original execution and frozen source set:

- The actual [local HTTP/private-vault result](../docs/evm-vault-http-actual-result.md)
  accepted 500 atomic PALT funding, 100 atomic BLTV private conversion,
  120-atomic payout, 380-atomic change, all withdrawals and 100 external atomic
  PALT redemption. Both pools ended with zero backing. These are fictitious
  six-decimal atomic units, not whole coins; GRAPH in that run used its private
  harness boundary. The earlier 400-share direct-service success is separate
- Genuine generic I84 uses the same 84 public fields for Ethereum, Base,
  Arbitrum, BNB and Tron proofs. This is not evidence of five working native
  wallet runtimes
- Local EVM run `c12dceb2` made five genuine proofs and one mined native transfer,
  then stopped before I84. Its reservation remains unresolved. Pinned Anvil
  needs 64 actual confirmation blocks; the narrow finality correction is
  source-only. A `latest`/`finalized` alias is not that evidence or mainnet finality
- Raw SOL run `a3b3acce` made deposit, V3 ingress and withdrawal proofs, issued
  3000000 atomic claims, made a separate 1000000 native solver transfer and
  obtained the V4 EVM REDEEM key/burn receipt. It failed the initial
  `BEGIN_PAYOUT` backing audit with `CLAIM_OPERATOR_AUDIT_TOO_OLD`. There is no
  completed native redemption or discharge. Original cleanup/source checks
  passed and the five gate files were restored. No whole-run retry is released;
  older `949dc03d` and `ab8e6290` liabilities also remain unresolved
- Tron passed its genuine local classloader probe, but actual startup rejected
  an original-owned Unix stream socket before ready. The owner-prepared config
  slot fix is source-only, not compiled or run; consensus, permission replay
  and native value acceptance remain unestablished
- Wrapped custody/GRAPH/withdrawal host evidence is source-only. The sealed
  same-app withdrawal packet passed 138 affected host checks with synthetic
  lower ownership/proof/native observations. CI51/CO42 compiler programs were
  separately revalidated. The three original constraint partitions completed
  81 distinct cases / 82 executions; the corrected data-only report consumer
  accepts those unchanged reports without granting artifact or production
  ownership. Statistics, verification keys and proofs remain pending. Equal
  public widths cannot substitute for exact ABI identity
- Pool rollover phase 1 and phase 2, whole-wallet acceptance and actual F
  recovery remain unaccepted. Browser visual/mobile acceptance is unverified:
  the prior loopback/IPC attempt was blocked and was not bypassed

These results do not close another original ledger's liability or authorize a
new run. Source-only fixes and test receipts never grant effects permission.

## Optional exact-action access

The existing `actionAccessMode: 'manual'` (also the default) retains the broad
manual action bearer and HTML bootstrap. Its same-origin page can still obtain
that broad bearer, so handing out a narrow token in manual mode does not isolate
another loopback caller from the broad manual interface.

For a narrowed API consumer, start the same application privately with
`actionAccessMode: 'exact-only'`. This mode creates no broad action token, omits
`app.actionAccess`, embeds an empty action-token value in HTML and accepts only
privately issued exact capabilities on the existing POST routes. Browser action
controls cannot confirm without a separately supplied exact capability;
registered account handoff reviews can be prepared without a token. The
owner read token and existing state GET are unchanged; this does not narrow
read access or protect the host against a malicious local process.

After original sessions/services are fixed, the private bootstrap can call:

```js
const app = await startWalletApplication({
  accountSession, nativeClaimSession, defiExit,
  actionAccessMode: 'exact-only',
});
const access = app.issueActionCapability({
  action: 'reconcile',
  body: { requestId: originalRequestId },
  ttlMs: 60_000,
});
```

The issuer takes exactly one plain data object with `action`, `body`, and optional
`ttlMs`. The action and body reuse `ALL_ACTIONS` and `buildActionBody`, not another
wallet schema. It returns only frozen `{ origin, token }`. Keep it private and
in memory; never place it in URLs, logs, errors, storage or serialized state.
Pass the token through the same `x-wallet-action-token` header or existing SDK
`actionToken` option. No HTTP mint, signer, budget, automation or consent prompt
is added. The issuer is trusted bootstrap authority, not a consumer interface. It does
not establish human consent. The trusted host must authorize the exact visible
step separately; every prepare, execute, reconciliation and recovery action is
a distinct decision. Registered native-note and wrapped-GRAPH actions require
`createManualActionHandoff()` rather than direct `issueActionCapability()`;
see [the handoff contract](MANUAL-HANDOFF.md).

- The token binds this original listener, its already-bound relevant original
  session/service, one existing route/action and the exact canonical body
- Object-key order and JSON whitespace are immaterial; every validated field,
  including original IDs, asset/reference and any amount/fee/quote terms, must
  match. Additional fields, wrong routes, other listeners and replay are denied
- Issuance requires the relevant original binding already to exist; disconnected
  or unrelated sessions cannot issue for a future binding. Issuance performs no
  journal read, health check or action admission
- TTL uses the monotonic process clock. Default is 60,000 ms; explicitly supplied
  TTL must be an integer from 1 through 300,000 ms. It is checked after the bounded
  request body is read and again at consumption, before admission/current-journal
  awaits. Expiry never cancels work already admitted or in progress
- Each listener may issue at most 64 capabilities for its lifetime. Invalid
  requests do not spend that count; successful issuance does. Consumption and
  expiry do not refill it. This is an in-memory issuance limit, not an amount
  budget, financial authorization or durable usage ledger
- A matching valid token is consumed synchronously before the first original
  journal/activity await, then never restored, even if a later check rejects,
  an original service fails, or the response is lost. An invalid route/body or
  pre-consumption HTTP/busy rejection does not consume it. This distinction is
  not a caller-visible cancellation/retry guarantee

The original journal/state/session fences still decide whether an action may
proceed. Original native 202, volatile account 200 and DeFi service-result
meanings are unchanged. Narrow capability issuance or consumption establishes
no durable admission, settlement, rejection, safe resend or restart recovery.
A lost reply remains UNKNOWN; retain the original ID and use manual original
reconciliation with separately authorized access. Never reissue or resend merely
because a token expired, was consumed, or its listener closed. Closing clears
volatile capabilities without cancelling original work; a new listener rejects
old tokens and has no durable capability history. Recreating a listener can reset
its issuance limit, so this facility cannot implement a lasting spend policy.

Exact-only mode attenuates API bearer authority. Existing common-host/OS trust,
owner read access, original custody and underlying authority remain unchanged.
It does not create a secure enclave, authenticate an external user, obtain their
consent, or establish production/public deployment security.

## Registered manual GRAPH and note handoff

An original registered private approval permits its fixed GRAPH through the
existing account prepare/execute/reconcile/recover routes and shared SDK
review/confirm flow in exact-only mode. Registered original native TOP_UP/EXIT
notes use the same account routes without `accountRecover`. The sealed wrapped
GRAPH composition requires the original manual handoff on every account step;
a directly minted token cannot replace that review. These are branded private
bindings, not a browser-selected profile or a flag that upgrades a session. The old manual broad bearer remains graph-read-only.
General graph execution stays disabled. The exact local route, account lifetime,
request ID, operation reference, budget, target note, solver liquidity and
cutoff are fixed before HTTP. See
[`manual-graph-wallet-actions.md`](../docs/manual-graph-wallet-actions.md) for
the historical EVM-vault source contract and [MANUAL-HANDOFF.md](MANUAL-HANDOFF.md)
for current handoff/least-privilege boundaries. Earlier GRAPH exclusions above remain the default for
ordinary sessions and unregistered graph IDs; no existing session is upgraded
by a boolean flag. This source addition is outside the actual accepted run.


## Wrapped note withdrawals (sealed source contract only)

The candidate `startWalletApplication`/`bindSessions` accepts the optional
original `wrappedWithdrawalSession`. Its private constructor is
`createWrappedWithdrawalSessionV1({runtime, system, owner, account, journal})`
from `wallet-platform/modules/api/wrapped-withdrawal-session-v1.mjs`, with
`journal: {path, password}` provided privately by the original owner. This is
not an HTTP session factory or a way around the closed release/artifact gates.
The constructor leases the original source owner once and fixes the original
wrapped pool/account identities; serializing or cloning objects cannot supply
the required authority.

The session exposes `snapshot()`, `ownerView()`,
`bindOriginalRecipient({recipient, provider, approval})`,
`submit(action, body)` and `close()`. Recipient binding is private, one-time and
must match the genuine original GRAPH payout and provider. The source owner's
`change` and the separate payout `recipient` are different authorities. Neither
can sign the other's note. The encrypted journal keeps at most one operation
per role, two total, and retains original terms and outcomes. This withdrawal
exits a private wrapped note into the fixed EVM recipient's wrapper-asset
balance. It is not native BTC/SOL delivery: wrapper issuance, private note exit,
claim burn, native payout and discharge are separate lifecycle boundaries.

The three fixed HTTP routes, exact bodies and state transitions are documented
in [UI.md](UI.md#wrapped-withdrawal-shared-model-contract-sealed-source-only);
the same [Node client](../wallet-platform/modules/api/WALLET-APPLICATION-CLIENT.md)
uses them without a second API schema. They require exact-only mode and a
separately authorized one-use action token. The account-only manual handoff does
not grant withdrawal access. The separate rendered-controls source follow-on
adds distinct source-change and payout-recipient cards in `app.mjs`/`index.html`,
with prepare/review/confirm/cancel/reconcile and a separate exact-access import.
It remains uninstalled and closed. Inert DOM/HTTP host checks execute those
controls; genuine browser visual, native and mobile acceptance remain unverified.

A lost send/reply retains the original operation for reconciliation only. No
new note authorization, proof, epoch, key or send is allowed. The EVM runtime's
uncertain-receiver fence persists even if the original receipt is subsequently
confirmed; reconciliation does not restore mutation permission. Session
`close()` synchronously blocks later effect steps and drains queued work and
recipient-binding writes before closing its store. This differs from
`app.close()`, which closes only HTTP and explicitly retains original sessions
and jobs. Neither is a refund or cancellation of a sent transaction.

## Versions, append-only pools and safe updates

The state remains `ACTIVE_FLAT_WALLET_APP_V1`; optional sections have their own
strict profiles. Update the server, shared codec, browser assets and Node bridge
as one reviewed source set. Unknown versions/fields are not permission to guess
or fall back to an older schema. Keep the pinned Node/dependency/toolchain and
exact source/artifact identities; a documentation patch does not repin code.

Pool generations are append-only within the global64 and eight-pool bounds.
Fresh TOP_UP needs the exact current `freshAdmissions` generation/asset pair.
Missing metadata remains readable but cannot select fresh TOP_UP/GRAPH. Old
notes, exits, consent, original IDs and pending/unknown actions stay on their
original generation. There is no automatic balance aggregation, migration,
capacity reset or unlimited rollover. See
[integrated generations](../docs/integrated-generations-and-recovery.md).

Before an authorized update, retain the original encrypted journals and their
identity/version metadata privately, plus immutable public source/evidence
receipts. Never use a cloned/restored journal to mint a new lifetime or clear an
uncertain outcome. Close listeners and drain original resources in their owned
order; review explicit preimages and the relevant source closures before any
installation. Preserve original failure provenance. An old accepted run does
not accept changed source, and a new fixture does not discharge old liabilities.
Do not run acceptance entrypoints, compile/prove, or open closed gates as part of
following these local read/manual API examples.
