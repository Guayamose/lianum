# Original local-shell manual account handoff

## Scope and trust boundary

This is a source integration for the existing browser-facing wallet client. It
adds no installed mobile transport, native hardware ownership, root signer,
browser-side owner-note preparation, generic signing interface, background
execution or HTTP
capability-issuing endpoint. The browser remains read-only until an already
authorized original local host explicitly hands off one existing server grant.
If that host cannot securely address the exact loaded document at the fixed
loopback origin, do not connect a transport. The controls fail closed.

The host and same-origin document are trusted. This does not protect a
compromised local host or authorized same-origin script. A mobile WebView or
native shell must provide its own authenticated, document-scoped in-memory
transport. No such platform transport is implemented or claimed here. Do not
substitute global postMessage listeners, URL/deep-link parameters, clipboard,
local/session storage, logs, remote callbacks, or caller-selected origins.

## Client/backend contract

1. The original owner process prepares and approves the exact GRAPH or supported
   native TOP_UP/EXIT privately. The
   genuine account session/catalogue binds its immutable original approval before
   the existing server starts with actionAccessMode: 'exact-only'. No browser
   operation prepares owner notes, signs a root authorization or selects a new
   account, generation, route, amount, recipient or cutoff.
2. In that same already-authorized local bootstrap, call
   `app.createManualActionHandoff()` once. It returns a frozen host object with
   `descriptor: {origin, listenerId}`, plus `authorizeReview`, `cancelReview` and
   `disconnect`. Keep this issuer interface private; never expose its functions
   to browser content or attach them to a generic RPC/HTTP bridge.
3. Open only that exact server origin. The existing page consumes its owner-read
   token and public listener identifier from ephemeral HTML metadata, removing
   both elements. The unchanged form and review dialog create a fresh random
   review nonce even without an action token. Review alone cannot send.
4. The pinned local shell reads getManualActionReview() from the already-loaded
   /app.mjs module in that exact document. This returns non-authorizing metadata
   only. After the shell's explicit authorization of those exact visible terms,
   call host.authorizeReview(request) once. Do not automatically approve a
   browser request or bind this method directly as a browser callback.
5. Transfer only the returned immutable grant in memory to that same document's
   acceptManualActionGrant(grant), and await its boolean result. It checks the
   original nonce and full request. It also performs a read-only, owner-
   authenticated GET /api/wallet/state to compare the pending grant's SHA-256
   commitment and current original bindings. A fake token cannot enable confirm.
   The token itself never enters state, subscriptions, DOM, URLs or persistence.
6. Import resets checkbox consent. The user reviews the unchanged immutable
   amount, recipient commitments, original cutoff, account identity, generation,
   listener and head, then checks the existing checkbox and clicks Confirm.
   A received grant never confirms or sends automatically.
7. The client removes the grant before its single existing-route POST. The
   original server capability registry verifies and consumes it before awaits.
   The server independently rechecks original journal revision, source head,
   account/generation membership and retained GRAPH/native-note terms immediately
   before admission.
   The GET commitment check is not final authorization. Existing authority,
   cutoff, queue and settlement checks remain authoritative.

The optional versioned state section is manualActionHandoff with profile
ORIGINAL_MANUAL_GRAPH_HANDOFF_V1. It exists only while the private host adapter
is connected. It contains origin, listenerId, original per-request bindings,
and either null or {reviewId, tokenSHA256}. It contains no grant token, owner
preparation, authority object or secret. Existing Node clients and old state
payloads remain compatible. The original issueActionCapability API is unchanged.

The handoff supports only `accountPrepare`, `accountExecute`, `accountReconcile`
and `accountRecover` for an already-bound genuine GRAPH. Registered original
native TOP_UP/EXIT notes use the first three; they cannot use `accountRecover`.
Prepare retains `{requestId, kind, ownerOperationRef, assetId}`; the other
account actions retain `{requestId}`. The private approval, not these public
fields, fixes amounts, recipients and note authority.

The metadata envelope remains `ORIGINAL_MANUAL_GRAPH_HANDOFF_V1`. A native-note
grant uses its own `ORIGINAL_NATIVE_VALUE_NOTE_HANDOFF_V1` review profile. In
the sealed, uninstalled wrapped source contract, the graph review is
`ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1`; its original account identity
must match the retained binding. The server requires this manual handoff for
every wrapped GRAPH account action and registered native-note action. Direct
`issueActionCapability()` is not a substitute for those paths. Broad manual-mode
GRAPH rejection is preserved; a broad bearer cannot create a host adapter or
authorize GRAPH/native-note handoffs.

The same Node constructor can take `manualActionHandoff: host.descriptor`
instead of `actionToken`; see the [Node contract](../wallet-platform/modules/api/WALLET-APPLICATION-CLIENT.md).
It creates no human consent prompt. The trusted Node caller must present exact
terms and get explicit authorization before host grant issuance and confirm.
Neither `can()`, a parsed review, a SHA-256 commitment, nor `canConfirm()` proves
human permission, independent chain finality or available funds.

Wrapped note withdrawals use the separate exact-token routes documented in
[UI.md](UI.md#wrapped-withdrawal-shared-model-contract-sealed-source-only).
The account handoff still has no withdrawal grant transport. The separate
rendered-controls source follow-on imports the existing one-use withdrawal
`issueActionCapability` result through its own wrapped review interface, never
through these account methods. Do not widen the account handoff into a generic
signer or expose either issuer to content. This is not visual/native acceptance.

## Cancellation, races and failure

- Form changes, another review, Cancel/Close/Escape, refresh and pagehide discard
  the client's pending review and in-memory token. No retained review is restored
  on Back/Forward. The shell must call host.cancelReview() on corresponding
  native cancellation and host.disconnect() plus disconnectManualActionHost()
  when the authenticated document transport closes. There is no ambient host
  discovery or automatic reconnection
- A changed origin, listener, account, generation, ID, body, terms, source head
  or journal revision cannot reuse an old review. Successfully issued nonces
  cannot mint another grant. Grants are deeply immutable and a newly imported
  grant cannot preserve old checkbox consent
- Host cancellation revokes the still-pending server token, including a grant
  being prepared or an admission paused at its final original-head check. A
  cancellation cannot undo an already-admitted original job
- The default server monotonic one-use TTL and lifetime issuance limit remain
  unchanged. Expiry, an unsuccessful POST, listener closure or a lost reply
  never authorizes reissuance or resend. The browser does not retry
- Account HTTP 200 means volatile queue acceptance only, never durable
  admission, native delivery, recovery success or settlement. A lost reply is
  UNKNOWN. Keep the original ID, refresh manually, and use a separately reviewed
  exact capability for original reconciliation or recovery
- If the owner view is unavailable, original reconciliation/recovery explicitly
  shows no observed head. It retains the authenticated original generation,
  account, journal revision, amount, recipient and cutoff. It neither fabricates
  a current balance nor changes the cutoff; the original recovery authority
  alone decides whether F is valid. An uncertain delivery is never resent

## Checks and limits

Run the focused host test from flat-wallet using the existing pinned Node:

    node --experimental-test-module-mocks --test wallet-app/manual-action-handoff.test.mjs

The test uses genuine account authority and opaque approval construction,
original portfolio/keeper/catalogue encrypted journals, graph session, HTTP
server, exact-action registry, shared browser client, and actual DOM consent
adapter. Lower owner, chain-reader, executor-review and pool-admission ports are
explicit synthetic fixtures. Source preparation uses an inert synthetic public
proof record; no backend/prover, owner key, signing, funds, deployment, native
process or external network is started. Synthetic execution deliberately fails
before proof work and stays UNKNOWN; recovery tests establish original-route
admission/fencing, not successful native recovery. DOM events are tested against
EventTarget ports; a real browser rendering or native mobile-shell acceptance
has not been established.


## Private authority, privacy and lifecycle limits

Only the original local bootstrap holds the host issuer. The document receives
one exact grant and an owner-read projection, never an owner/root key, proof
witness, raw native wire, journal password or authority object. Read access is
still broad within that owner projection; a one-action grant does not make
same-origin scripts or local processes mutually isolated. Native RPC facts,
custody/operator availability and common-host trust remain separate assumptions.
Encrypted local journals do not prove systemic metadata privacy.

An unavailable amount/head stays explicitly unknown. Original source generation,
account lifetime, request ID, terms and consent do not migrate to a new pool,
listener or process. Refresh, form changes, cancellation and newer reviews must
invalidate the old grant. Closing a listener revokes its volatile access but
retains original sessions and jobs. Close/Cancel is never on-chain cancellation.
The caller must separately drain the owned resources; no replacement session or
new token repairs an uncertain original send.

The source-only wrapped withdrawal session additionally fences later effect
steps immediately on `close()` and drains recipient-binding writes/queued work.
Original-receipt reconciliation never clears a poisoned/uncertain EVM receiver.
No refreshed consent, copied store, changed epoch, increased freshness allowance
or substituted finality observation can restore that lost mutation authority.

Actual manual browser rendering, native/mobile transport and completed F
recovery remain unaccepted. Deterministic consent/HTTP host checks do not change
that status. The [application status](README.md#version-and-acceptance-boundary-2026-10-06)
separates accepted local economic evidence from source-only contracts and open
native liabilities; no instructions here authorize a new effects run.
