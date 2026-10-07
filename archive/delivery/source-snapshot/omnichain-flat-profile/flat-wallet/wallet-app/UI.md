# Active-flat browser workflow

This UI belongs to the active flat wallet under `wallet-app/public`. It adapts
the local visual language of the frozen reference client; it does not load or
relabel the reference wallet's pools, simulation SDK or execution paths.

The application server and private bootstrap own session binding. The CLI can
serve this UI while disconnected; that does not create a wallet, notes, native
funds, owner process or proof job. A funded workflow requires the original
branded sessions and their surviving custody/runtime resources.

## What the user can do

1. Open the local URL printed by the application server. The page performs one
   initial state read. Afterward, use **Actualizar estado** explicitly; there is
   no background polling, automatic retry or automatic resume.
2. Inspect each asset's available, reserved, recovery and locked amounts in its
   own units. Recovery is not an extra amount to add to available/locked. Null
   or unavailable observations are never displayed as zero balances.
3. Inspect native claims as custodial wrappers and existing ERC4626 share
   positions as estimates. Estimated underlying value is not another private
   spendable balance. The UI does not independently verify chain/proof truth.
4. Use the private account section to bind an already owner-prepared TOP_UP or
   EXIT reference to its exact observed asset. Explicitly review execution only
   after the original journal reports PREPARED. Use original-ID reconciliation
   for an eligible unresolved or retained original operation.
5. Choose an explicitly supported native action, enter its existing identifiers
   and exact atomic-unit amounts, then select **Revisar operación**. Read the
   unchanged terms and prerequisite note, check consent, and confirm once.
6. Keep the original request ID. Native HTTP 202 means durable admission, not completed
   native settlement. Refresh manually to inspect the original request. If a
   response is lost, use the original ID for explicit reconciliation; do not
   create a replacement transfer or assume the earlier one failed.

Deposit uses an owner-prepared original intent. The browser cannot create that
handoff or its proof. Redemption requires the original owner release and the
corresponding wrapper claim available to burn; a displayed private-note balance
does not replace that prerequisite. Refunds retain the original intent and
fixed destination. Resume is an explicit continuation of the original request,
not a harmless status refresh.

## Fixed browser/backend contract

- GET `/api/wallet/state` uses `x-wallet-owner-token`
- POST `/api/wallet/native/deposit` and `/refund` use `{ requestId, intentId }`
- POST `/api/wallet/native/redeem` uses `{ requestId, amount, maxFee }`
- POST `/api/wallet/native/reconcile` and `/resume` use the original `{ requestId }`
- Every POST uses only `x-wallet-action-token` and JSON

The server embeds `__WALLET_OWNER_TOKEN__` and `__WALLET_ACTION_TOKEN__` into
corresponding HTML meta fields. Browser code reads them into a private module
closure and removes the meta elements. Nothing is saved to browser storage,
URLs or logs. These are local application-access tokens, not owner root/spend
keys. This common-host arrangement does not isolate against a compromised host
or an already-authorized same-origin script.

The state profile is `ACTIVE_FLAT_WALLET_APP_V1`, version 1. It contains explicit
connection, portfolio, nativeClaims, capabilities and error sections. The
optional account section carries its original journal snapshot. Optional
network/DeFi sections do not enable routes on their own. General GRAPH is
disabled; only registered exact-only account handoffs described below can
authorize their original GRAPH. The sealed wrapped model extension and separate rendered-controls
source follow-on remain uninstalled; neither establishes visual acceptance.

### Bound native asset and units

Authenticated `nativeClaims.identity` identifies the original session's fixed
configuration: version 1, profile `ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1`,
accountId, claimDomain, nativeFamily, nativeGenesis, nativeAsset,
wrapperAssetIdentity, claimSymbol, nativeSymbol, decimals, atomicUnit, and
observation `ORIGINAL_BOUND_CONFIGURATION_ONLY`. Family `"1"` requires
cBTC/BTC/8/satoshi; family `"2"` requires cSOL/SOL/9/lamport. Commitments are
nonzero lowercase, unprefixed 64-character hex strings. Native and wrapper
identities must differ. `wrapperAssetIdentity` is not the portfolio `assetId`.

Each native form and its copied confirmation show the bound asset/unit and full
claim domain, along with the original account, genesis and asset identities.
Redemption shows both unchanged atomic integers and exact decimal formatting:
the claim amount uses its cBTC/cSOL unit and the maximum native fee uses BTC/SOL.
Deposit/refund can show the selected original intent's retained amount; an
unavailable amount stays unavailable. No symbol, decimal count or action target
is inferred from the order or labels of a combined portfolio.

Deposit, redemption, refund and resume require a valid current identity that
agrees with the owner intent/ticket domains. A missing or malformed identity
blocks these actions without replacing it with cached configuration. The page
also rejects a different session identity after its first valid binding; inspect
the local process and reopen the page to deliberately change sessions. Refresh
always invalidates the prior review. Caller-visible copies cannot edit the
identity or amounts retained for confirmation, and identity is never added to
the unchanged POST bodies. There is no chain or destination selector.

This identity reports original configuration only. It does not establish current
custody, ownership, spendability, proof verification or native settlement.
Original reconciliation remains available without identity only under its
existing freshly received journal/capability fences and displays the identity
as unavailable. It never obtains permission to resume or submit new effects.

## Manual private account TOP_UP and EXIT

The optional `account` section is null when no original account session is
bound; otherwise it contains `{ snapshot }`, using the unchanged
`LOCAL_FLAT_ACCOUNT_API_V1` session snapshot or null when unavailable.
`errors.account` carries its bounded failure code. Its three explicit server
capabilities and fixed action-token routes are:

- `accountPrepare`: POST `/api/wallet/account/prepare` with
  `{ requestId, kind, ownerOperationRef, assetId }`; kind is TOP_UP or EXIT only
- `accountExecute`: POST `/api/wallet/account/execute` with `{ requestId }`
- `accountReconcile`: POST `/api/wallet/account/reconcile` with `{ requestId }`

The original owner process must already have prepared and retained the
operation. The form selects an exact observed assetId and shows its full
identity, symbol and decimals in a detached review. The opaque reference does
not expose amount, recipient, keys, witnesses or proof input; these remain with
the original owner and authority. Selecting an asset does not select a new chain,
signer or destination. No arbitrary preparation payload crosses HTTP.

Execute requires an original TOP_UP/EXIT journal row in PREPARED and exactly one
matching current owner-portfolio request identifying that asset. The match uses
requestId, kind and exact assetId, never ticker/order or the native wrapper
identity. Missing, stale, duplicate or conflicting owner mappings block
execution. Preparation requires a current unambiguous asset and a new request
ID, except for an explicit continuation of the same original PREPARING ID and
TOP_UP/EXIT kind. The continuation asks for the original ref/asset; the browser
cannot compare them to hidden journal fields. The original keeper's binding
check remains authoritative: any difference must fail, never rebind. This is
not an automatic retry, replacement ID or execution fallback. Other existing
states and altered kinds remain blocked. GRAPH and unknown execution/reconcile
IDs, close and coordinator restart are not exposed by the ordinary account
workflow. Registered GRAPH has the narrowly scoped recovery exception below.

Reconciliation uses only an original TOP_UP/EXIT row in SUBMITTING, UNKNOWN,
RECOVERING or CONFIRMED. It may use the fresh journal when the private owner
projection is unavailable; the asset is then explicitly unavailable, rather
than borrowed from cached portfolio metadata. It does not resend execution.

Account HTTP **200** uses `FLAT_ACCOUNT_VOLATILE_ADMISSION_V1` with
`acceptance:VOLATILE_UI_QUEUE_ONLY`, `durableAdmissionEstablished:false` and
`settlementEstablished:false`, enclosing the original session acknowledgment.
The UI reports **queued locally, volatile, potentially not durable**. It rejects
native-style HTTP 202 or contradictory durability/settlement fields. Admission
SUCCEEDED means local command processing finished; it is not an account outcome.
Only a subsequent original journal and owner view can report the retained result
and current terminal disposition. No balance is changed by an acknowledgment.

Keep the same request ID after a lost response. Manually refresh the snapshot;
an absent journal row does not prove rejection or authorize a replacement.
Account, native and DeFi last-request IDs are kept separately in page memory.

## Optional native-network and DeFi views

The backend can publish fixed, privately configured native-network observations
under `networks`. A configured RPC is not a live connection or a verified chain.
Fresh external balances remain trusted-RPC observations; unknown, stale and
reorged values stay unavailable. They are separate from private-note balances,
with `creditEligible:false` and `privateSpendableAtomic:null`. There is no
browser address, genesis, RPC URL or chain-target input.

### Original EVM transfer metadata

Optional `transfers` is null without registered observers; otherwise its exact
profile is `FIXED_ORIGINAL_EVM_TRANSFERS_V1`, observation is
`TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY`, and `rows` contains at most eight
privately registered originals. Each row has ownerAddress, direction
(outgoing/incoming/self), refreshStatus (REFRESHED/BLOCKED/FAILED), errorCode and
the observer's sanitized `flat-evm-original-transfer-status/1` status. The UI
accepts only the fixed Ethereum, Base, Arbitrum and BNB descriptors. The complete
chainId/genesis network identity and nativeId distinguish originals; duplicate
networkId/nativeId rows are rejected. Direction must match the original from/to
and privately associated owner address.

The section shows the full original transaction ID, from/to, owner association,
chain/genesis, native asset ID/commitment, nonce/type and exact original amount
in atomic and decimal units. Amounts are original transaction terms, including
for pending, reverted or unknown status; they are never delivered or credited
amounts. Missing observation timestamps remain unavailable rather than zero.

Every row remains `metadataOnly:true`, source `retained-observation-metadata`
and freshness `not-revalidated`. Even an `observed` status and a future retained
validUntilMs do not establish current finality. currentFinalityVerified,
creditEligible, graphAdmissionEligible, deliveryVerified and
recipientRetainedValueVerified stay false; privateSpendableAtomic stays null.
These are trusted-RPC metadata, not independent consensus/proof verification,
recipient retained value, custody or private spendability. Raw signed wire,
signatures, receipt/log data, endpoints and keys are rejected from this UI shape.

The existing authenticated global state GET is the only browser read path.
The host may query its privately registered original observers when both
account/native journals are clear. There is no transfer action route, selector,
transaction-ID input, endpoint input, polling or retry. The initial state read
and each explicit global refresh use that same fixed path.

RPC status and display history are separate: account/native activity or
unavailable journals, in-flight reads/actions, failed refresh and retained
section errors mark rows historical/unrevalidated. Freshly supplied blocked,
failed or unknown rows replace older observed statuses; the browser never
substitutes a prior success for a new failure. Only a missing section with an
explicit transfer error may retain the previous list, visibly historical. An
empty supplied list stays empty. No rows means no transfer section, except a
received section error, which is shown without inventing a transfer or amount.

### Original share exit and vault redemption

The optional DeFi service tracks an original, already-confirmed share-note EXIT
and its separate public vault redemption. Its actions do not create that EXIT;
the separate account workflow can execute an already owner-prepared original
EXIT when its exact asset and journal prerequisites are satisfied. Its five
fixed manual DeFi actions are:

- POST `/api/wallet/defi/prepare`: `{ requestId, minimumOutput, deadline }`
- POST `/api/wallet/defi/requote`: the same fields, replacing only the original
  minimum/deadline of a never-submitted redemption
- POST `/api/wallet/defi/execute`: `{ requestId }`
- POST `/api/wallet/defi/reconcile`: `{ requestId }`
- POST `/api/wallet/defi/reopen`: `{}`

All use the application action token and explicit review/consent. Minimum output
is a positive uint128 atomic amount; deadline is a positive uint64 original
chain timestamp, never a browser-clock estimate. Capabilities come from the
bound service. Requote cannot resend or replace an uncertain transfer.

HTTP 200 returns a service state, unlike native HTTP 202 durable admission.
Neither response creates a new private balance. Redeemed underlying belongs at
the original external owner address; `underlyingPrivateSpendable` remains false.
Native, account and DeFi original request IDs remain separate. The private audit receipt
is not an exposed UI route.

## Interruption behavior

Only one read or action submission is active at a time. Opening a review does
not send anything. Editing or cancelling the review prevents the old reviewed
terms from being submitted. Confirming twice cannot issue two requests.

A failed read marks retained values as historical/stale. A lost mutation reply
preserves its original request ID and reports unknown acceptance/outcome. New
actions require a successful explicit state read and an advertised original
capability. Recovery-only exceptions do not turn unavailable data into
permission for new effects: native reconciliation can use an actually received
READY, idle, storage-available journal snapshot even if the private owner view
failed; DeFi reopen can use its explicit capability from a freshly received
CONNECTED app state even if the original service snapshot is unavailable.
Account reconciliation can use its eligible original journal row with the asset
explicitly unavailable when the owner view fails.
Cached snapshots, failed transport and global stale/read/send fences still
block these operations. Resume, execute, requote and new preparation receive no
such exception. Every recovery remains a manual reviewed action.

Bound account and native journal snapshots must be freshly received, available
and idle before any account/native/DeFi action. The sealed wrapped extension
adds its original withdrawal journal to the same shared activity fence. Busy/queued work or an
unreadable journal blocks conflicting mutations, including recovery paths.
The server reads these journals before owner/custody/DeFi projections and skips
those reads while an original job is active. Cached journal data cannot clear
this shared fence. Fixed external holdings observations do not grant action
permission.

Closing or reloading the page does not cancel the server's durable jobs;
identifiers kept only in browser memory disappear with that page.
Account admission queues are volatile and may disappear with their process;
they do not replace the original keeper journal.

## Validation scope

`node --test wallet-app/ui.test.mjs` exercises presentation and the fixed-route
client using synthetic state and transport responses. These host checks do not
start a node, make a native transfer, generate a proof or certify a funded wallet.
Transfer coverage includes the genuine observer's sanitized status accessor
using synthetic public-signature fixtures and a mocked in-memory RPC transport;
it makes no network request or broadcast.
Actual browser/visual checks, when available, must be reported separately from
those deterministic tests and from genuine native acceptance.

The attempted disconnected browser capture was blocked before page load by
the executor's Chromium IPC socket permission, even through the approved
execution route with the normal browser sandbox. No security-disabling flags
were used. Visual/browser interaction acceptance is therefore still unverified;
the disconnected listener was closed cleanly.

### Original Tron and mixed-network metadata

The same optional `transferObservers` private bootstrap accepts branded Tron
readers with the same fixed owner/network association and shared journal fence.
A section containing Tron uses `FIXED_ORIGINAL_NATIVE_TRANSFERS_V2`; EVM-only
sections retain V1. Tron rows use `flat-tron-original-transfer-status/1`, null
chainId/nonce, `TransferContract`, and six-decimal native TRX. They carry explicit
RPC-solidification-only and independent-consensus/account-permission/TAPOS/expiry
false flags. No new action or selector is exposed. The existing shared Node
client inherits this schema through the same view model. Deploy the server and
shared UI/schema changes together; older clients must reject unknown V2. See
[the complete observation contract](../docs/tron-native-transfer-observer.md).


## Optional exact-only registered graph extension

The source candidate shares the existing immutable review/confirm workflow with
the Node/local bridge. `accountRecover` is a fixed account action with only
`{requestId}` and a fresh separate exact grant. Only original source-authenticated private approvals appear in
`account.manualGraphs`; the exact review profile fixes their route. Registered
native notes appear separately in `account.manualNativeNotes` and cannot use
`accountRecover`. The sealed wrapped GRAPH profile is
`ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1` and requires the manual handoff
on every account step. General `graphExecution`
remains false; `manualEvmVaultGraph` is enabled only in exact-only mode for a
registered approval. The ordinary broad-token browser is graph-read-only, and
no visual browser graph acceptance is claimed. No HTTP route accepts graph
packets, destinations, amounts, cutoffs, RPC configuration or keys. See the
[full source contract](../docs/manual-graph-wallet-actions.md).


## Wrapped withdrawal shared-model contract (sealed source only)

This is the closed candidate server/shared-model/Node contract. A separate,
uninstalled source follow-on adds rendered `app.mjs`/`index.html` controls for
the original change owner and payout recipient. It is not native or visual
browser acceptance. It uses the same
`GET /api/wallet/state`, owner read token, review/confirm model and journal
activity fence. The optional `wrappedWithdrawals` section has `{snapshot, owner}`
and `errors.wrappedWithdrawals`; missing/unavailable data stays unknown.
The state profile is `ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1`.

These actions are in the candidate `ALL_ACTIONS`:

| Action | POST path | Exact JSON body |
| --- | --- | --- |
| `wrappedWithdrawPrepare` | `/api/wallet/wrapped-withdrawal/prepare` | `{requestId, role, termsSHA256}` |
| `wrappedWithdrawExecute` | `/api/wallet/wrapped-withdrawal/execute` | `{requestId, termsSHA256}` |
| `wrappedWithdrawReconcile` | `/api/wallet/wrapped-withdrawal/reconcile` | `{requestId, termsSHA256}` |

`requestId` is 8–100 ASCII letters, digits, `_` or `-`. `role` is exactly
`change` or `recipient`. `termsSHA256` is the unchanged nonzero lowercase
64-hex digest received from the original offer/operation. No request accepts
amount, destination, note, pool, epoch, source head or authority overrides.
Each POST requires its own exact one-use token in `x-wallet-action-token`, JSON,
the exact loopback Origin and `actionAccessMode: 'exact-only'`. A broad manual
token is rejected; the account manual-handoff descriptor is not withdrawal
access. Never recompute terms to disguise a changed original offer.

The rendered follow-on exposes `getWrappedWithdrawalReview()`,
`acceptWrappedWithdrawalActionAccess({review, access})` and
`disconnectWrappedWithdrawalHost()` as direct module methods. These are separate
from the account handoff. The original local shell must pin the already-open
document, origin and listener, inspect that exact review, and only after explicit
authorization obtain `access` from the existing private
`application.issueActionCapability({action: review.action, body: review.body})`.
It explicitly imports that unchanged result with the same review. There is no
automatic issuer callback, new HTTP issuance endpoint or new Node SDK option.
Every prepare, execute and reconcile needs a separate grant and a fresh checkbox
confirmation. Importing a grant alone sends nothing. The envelope binds original
terms/body, revision, random review identity and pinned origin/listener; it is
not an authority credential. Only the server registry proves that the token
belongs to that original listener, body and session. A forged token is refused
there, without service effects, and the browser conservatively retains UNKNOWN.

Cancel, Escape, dialog close, refresh and page departure invalidate an unspent
local import. The host may revoke its unused capability with the existing
`application.revokeActionCapability(access)`. Closing a dialog cannot cancel an
already-posted original job. Tokens stay in memory and never enter URLs, DOM,
logs or persistent storage. Failed/lost replies retain the original ID and
block replacement preparation/signing. An observed uncertain signing/send
journal or ambiguous execute response conservatively fences both wrapped roles
for this page, even after original reconciliation. An unknown prepare may remain
read-only when no supported original reconciliation exists; no retry is inferred.
The actual service retains the authoritative mutation fence across page reloads.
Source/host tests use actual rendering/event code and HTTP/token registry with
inert DOM and lower-authority fixtures; browser visual/mobile/native checks and
all operational release gates remain outstanding.

An offer carries `terms` and `termsSHA256`. The immutable review context uses
`ORIGINAL_WRAPPED_WITHDRAWAL_TERMS_V1` and binds role; actor kind, identity,
process identity and generation; original pool; assetId and asset metadata;
noteCommitment; exact atomic amount; fixed recipient; epoch; complete observed
head; registryCommitment; and claimAuthority. Amount is a positive decimal
integer below 2^64. Epoch is the original head timestamp divided by 600, not
browser time. The source `change` actor is
`ORIGINAL_WRAPPED_SOURCE_OWNER_CHANGE`; the independent `recipient` actor is
`ORIGINAL_GRAPH_PAYOUT_RECIPIENT`. `owner.privateSpendable` is always null.
A visible offer is not spend authority or current finality.

- Prepare durably retains exact terms as `PREPARED`; it performs no note signing,
  proof or send. There is one original operation per role and at most two total
- Execute requires that original `PREPARED` row and exact terms digest. It
  persists `EXECUTE_ADMITTED`, then `SIGNING_UNKNOWN` before note authority and
  proof work, and `SEND_UNKNOWN` before the one original send. Original process,
  generation, head, note and runtime-mutation fences are rechecked. Head drift
  cannot be repaired by silently renewing the epoch or note
- Reconcile is selectable only for `SEND_UNKNOWN`, `UNKNOWN` or `CONFIRMED`,
  with the retained original ID and digest. It needs the original proof/calldata
  and unique retained send, transaction and canonical receipt. It checks the
  original nullifier and exact pool/recipient amount deltas before `CONFIRMED`.
  A pre-send failure may remain unresolved; no original send means no replacement
- A matching HTTP 202 body is `{admitted:true, action, requestId}`, where action
  is `prepare`, `execute` or `reconcile`. The shared client outcome is
  `DURABLE_WRAPPED_WITHDRAWAL_ADMISSION`, never settlement. Execute/reconcile
  jobs may still fail after durable admission
- Lost, malformed or failed responses produce client `UNKNOWN` and stale state.
  Preserve `originalRequestIds.wrappedWithdrawal` once populated, manually
  refresh and review original reconciliation separately. A received 202, spent
  token, empty offer list, client timeout or missing journal row is not a refund,
  cancellation, proof of rejection or authority to retry

The session's retained error for unresolved work is
`WRAPPED_WITHDRAWAL_ORIGINAL_RECONCILIATION_REQUIRED`. Internal errors such as
`WRAPPED_WITHDRAWAL_APPROVED_HEAD_CHANGED` and
`WRAPPED_WITHDRAWAL_RECEIVER_MUTATION_FENCED` are not a stable HTTP error API:
the existing server sanitizer maps unlisted prefixes to `WALLET_OPERATION_FAILED`.
The shared client deliberately treats a failed action response as UNKNOWN;
inspect authenticated retained state rather than branching into retries on an
error string. `WALLET_WRAPPED_WITHDRAWAL_EXACT_ACCESS_REQUIRED`, activity and
access errors remain ordinary server refusals, not economic outcomes.

Reconciliation observes the original only and never clears an uncertain EVM
receiver's permanent mutation fence. It cannot sign again, regenerate a proof,
send again, reset the original generation or reauthorize another destination.

## Generation-aware reads and choices

The current owner projection keeps pools/generations separate and does not sum
unlike assets or migrate notes. Fresh TOP_UP selection requires a current exact
`freshAdmissions.routes` generationId/assetId pair. Older reads without that
optional metadata stay readable but do not enable fresh TOP_UP or GRAPH. Old
prepared requests, EXIT, reconciliation and consent retain original routing;
a successor outage never turns an old note into a new-generation note. Capacity
is still bounded (global64/eight pools), with actual two-phase rollover pending.
See [the generation contract](../docs/integrated-generations-and-recovery.md).
