# Manual wallet application client for Node

`wallet-application-client.mjs` is a small local SDK bridge to the existing
[wallet application](../../../wallet-app/README.md). It imports the frozen
browser `createWalletClient` and `ALL_ACTIONS` directly. The sealed wrapped
withdrawal addition is uninstalled/closed; its actions below become part of that
same shared model only with the reviewed source set. It does not define a
third wallet schema, create sessions, hold root/spend keys or add capabilities.
The existing [manual workflow](../../../wallet-app/UI.md) remains authoritative.

## Runtime and bootstrap

Verified with the pinned Node **v24.19.0** runtime, using ESM and Node's built-in
HTTP client. No new dependency is installed. This is a Node/local-client bridge,
not a native-mobile SDK, browser package, public deployment or production-wallet
acceptance. Keep the relative shared module present when distributing this tree.

The trusted private process obtains credentials from its own original
`startWalletApplication` result. It must pass the exact origin and tokens
directly in memory; never scrape HTML or put tokens in URLs, command-line
arguments, logs, storage or error reports.

```js
import { createWalletApplicationClient }
  from './wallet-platform/modules/api/wallet-application-client.mjs';

// app is the original trusted startWalletApplication result, not a new session.
const reader = createWalletApplicationClient({
  origin: app.origin,
  ownerToken: app.ownerAccess.token,
});

const received = await reader.refresh(); // One explicitly requested read.
const state = reader.getState();
```

The constructor accepts exactly one plain data object with `origin`,
`ownerToken` and either optional `actionToken` or optional `manualActionHandoff`,
never both. Origin must be exactly
`http://127.0.0.1:<port>` with canonical decimal port 1–65535. Paths, a trailing
slash, query, fragment, credentials, hostname/IP aliases and IPv6 are rejected.
Tokens must be exactly 64 lowercase hex characters. Omit `actionToken` for
read-only mode if `manualActionHandoff` is also omitted; explicitly supplying
`undefined`, empty or malformed tokens is an error. Extra options, accessors and proxies are rejected. Scalar values are
copied at construction; editing the input object cannot retarget the client.

## Manual methods

Without a handoff descriptor the frozen Node object exposes these seven shared
workflow methods:

- `getState()` returns a detached state snapshot, including freshness, review,
  outcome and original request IDs
- `subscribe(listener)` immediately sends a detached snapshot and later local
  state updates; it returns an unsubscribe function and does no network work
- `can(action)` checks the shared current-state and token fences
- `refresh()` performs at most one fixed state GET and returns a boolean
- `review(action, exactBody)` validates the existing action body and records a
  detached review of the original action and identity
- `cancelReview()` discards a review only while no action is being sent
- `confirm()` performs at most one fixed POST for a still-valid review and
  returns a boolean; it does not refresh, retry or poll afterward

Construction performs no network work. Omitting both action credentials keeps
every `can(action)` false regardless of reported server capabilities. A handoff
descriptor allows only eligible tokenless account reviews; it is not a token and
cannot enable confirmation by itself. There is no
public fetch function, URL/path/header choice, timeout override, generic signer,
RPC selector, automatic retry or polling. Registered GRAPH remains limited to
its original separately authorized account handoff.

An explicitly authorized caller may create an action-enabled client using
`actionToken: app.actionAccess.token`. It must present the review and apply its
own user-authorization/UI policy before calling `confirm()`. Calling `confirm()`
is an effectful invocation of the existing action capability: the method does
not obtain user consent, provide an authorization prompt, or narrow the scope
of the supplied bearer token. Neither `can()` nor `review()` grants permission.
Do not automatically confirm an action after review.

The action names and request bodies are exactly those already exported by
`ALL_ACTIONS`: native deposit/redeem/refund/reconcile/resume; DeFi
prepare/execute/reconcile/reopen/requote; account prepare/execute/reconcile/
recover; and, in the sealed candidate, wrappedWithdrawPrepare/
wrappedWithdrawExecute/wrappedWithdrawReconcile. The exact action identifiers
and JSON bodies are in [UI.md](../../../wallet-app/UI.md).
The SDK retains existing Spanish review notes/errors without translation or
reinterpretation. Unknown actions and additional body fields fail closed.

## Identity, freshness and outcomes

The shared workflow keeps native, account, DeFi and candidate wrapped-withdrawal
original IDs separate. Native
identity comes from the original authenticated session configuration, never
portfolio position or ticker. Its identity-pinning, asset checks, journal
busy/stale fences, immutable review and double-confirm behavior are unchanged.
There is no automatic freshness expiry beyond the shared workflow; callers
should manually refresh when needed, and the server rechecks actual admission.
The SDK does not claim that cached metadata proves current finality or funds.

- Native `ADMITTED` requires HTTP 202 and the matching original action/ID. It
  describes durable journal admission, not settlement
- Account `VOLATILE_QUEUE_ACCEPTANCE` requires the exact existing HTTP 200
  envelope with `durableAdmissionEstablished: false` and
  `settlementEstablished: false`. It acknowledges only a volatile local queue
- Wrapped `DURABLE_WRAPPED_WITHDRAWAL_ADMISSION` requires HTTP 202 and the
  matching original command/ID; it establishes journal admission only
- DeFi `SERVICE_RESULT` is a service phase. Any redeemed underlying remains at
  the original external owner address and is not private spendable credit
- Any lost, malformed, failed or timed-out action response yields `UNKNOWN`,
  keeps the original request ID, marks the view stale and never resends

A successful `confirm()` therefore does not mean funds settled. A failed one
does not prove rejection or cancellation. Preserve the original ID, manually
refresh and use the existing original-operation reconciliation path. A refresh
does not itself establish authority to resend, even if an action becomes
available again. `cancelReview()` is not server cancellation and cannot cancel
an in-flight action. Dropping the client or closing an app listener does not
cancel an admitted job or close its original session.

## Transport bounds

The private HTTP adapter sends only `GET /api/wallet/state` and the fixed POST
routes derived from `ALL_ACTIONS`, to the bound literal IPv4 loopback address.
GET sends the owner token; POST sends the separate action token. Each request
sets exact Host and Origin, accepts JSON and requests identity encoding. No
cookies, redirect following, proxy/custom agent, DNS selection or caller headers
are used. Tokens stay in the corresponding headers; transport error messages
are fixed labels and never include exception text or credential values.

Request bodies are capped at **4096 bytes**, response bodies at **256 KiB** and
response headers at **8192 bytes**. Oversize, duplicate framing/type headers,
unsupported content types/encodings, malformed UTF-8/JSON, redirects and
incomplete responses fail closed. These are wire limits; all wallet body,
response-schema and acceptance semantics remain in the shared workflow.

The shared **90-second read** and **30-second action** AbortSignal deadlines
cover headers and the entire bounded body read. Expiry stops local response
waiting and destroys that HTTP request, not the server's original work. Late
bytes cannot restore current state or replace an UNKNOWN outcome. No deadline
setting is exposed by this SDK.

This is the app's existing trusted-host security profile. Bearer-token use and
exact loopback binding do not isolate a compromised host or authorized local
process; public/TLS deployment and independent operator isolation are unproven.

## Verification

From `flat-wallet`, with the pinned runtime:

```sh
env -u NODE_OPTIONS -u NODE_PATH node --experimental-test-module-mocks --test \
  wallet-platform/modules/api/wallet-application-client.test.mjs \
  wallet-platform/modules/api/wallet-application-client.transport.test.mjs
```

The actual application listener is owned, disconnected and only read. All
effectful responses come from explicitly synthetic owned loopback fixtures.
Deterministic mock transport/timers cover aborts, incomplete replies and late
data without starting native nodes, proofs, wallets or transfers. This evidence
does not establish native acceptance, browser interaction, funds, production
security or performance. This historical test scope does not transfer acceptance to later source edits.
The sealed wrapped packet separately records 138 affected host passes with
synthetic lower proof/native observations; no native/mobile or browser visual
acceptance follows from those checks.

## Privately issued exact-action bearer

The same constructor and manual workflow also accept a one-use exact-action
bearer from the original application's private bootstrap. No second wallet schema is introduced:

```js
const access = app.issueActionCapability({
  action: 'reconcile',
  body: { requestId: originalRequestId },
  ttlMs: 60_000,
});
const client = createWalletApplicationClient({
  origin: access.origin,
  ownerToken: app.ownerAccess.token,
  actionToken: access.token,
});
// Perform only the separately authorized manual refresh/review/confirm steps.
```

Use an application fixed to `actionAccessMode: 'exact-only'` if the consumer
must not be able to obtain a broad action bearer from the served manual page.
That mode omits `app.actionAccess`. Tokenless registered account review is
possible through the handoff descriptor, but confirmation still requires the
separately authorized grant. Manual
mode remains the explicit broad-token baseline and must not be presented as
isolation from other same-origin/local callers.

The server enforces the exact existing action/body, original listener/session,
monotonic TTL and one-use consumption. `can()` and `review()` still describe the
shared wallet workflow and current service capabilities; they do not inspect
this opaque token's action scope, expiry or remaining use. A different review
can therefore be locally available and still fail at the server. Any failed or
lost action response remains UNKNOWN with the original request ID; the SDK
never automatically retries, reissues, refreshes or reconciles. A new capability
for a different authorized manual step requires the private bootstrap; there
is no mint endpoint or SDK mint method.

The server consumes a matching token before its first current-journal/admission
await and does not restore it on any later failure. This volatile consumption
is not evidence of durable admission, rejection, cancellation, settlement or
safe resend. Its default one-minute/max-five-minute TTL gates admission only;
it does not cancel already-started work. The 64-per-listener lifetime issuance
cap is not a lasting spending budget and resets with a new listener. Original
journals and request IDs remain authoritative for recovery; old capabilities
cannot transfer to a new listener. See the application README for exact bounds.


## Registered manual GRAPH and native-note handoff

An original registered private GRAPH approval may be used through `accountPrepare`,
`accountExecute`, `accountReconcile` and `accountRecover` in exact-only mode.
The four-field prepare body and request-ID-only terminal bodies are unchanged;
`accountRecover` maps to `/api/wallet/account/recover`. The old manual broad
bearer is graph-read-only. Each step needs a separately issued one-use exact
capability, an explicit current review and confirm. The shared SDK creates no
capabilities or approvals and never automatically reissues, retries or recovers.

The review shows the retained source budget, solver-own liquidity, destination
shares/note, original recipients, route and cutoff. `accountRecover` requests
only the original F transition or original completed outcome; source authority
still decides when it is valid. It may be explicitly requested while the owner
is offline after the original execution cutoff, with the same request ID and
approval. It does not undo a prior target delivery or resend it. A response loss
remains UNKNOWN and only original-ID observation/reconciliation is appropriate.
See [the source contract](../../../docs/manual-graph-wallet-actions.md). Actual
EVM acceptance has not exercised this new SDK/GRAPH addition.


The current constructor's optional `manualActionHandoff` must be exactly
`{origin, listenerId}` from the private `app.createManualActionHandoff()` result's
`descriptor`. Its origin must equal the constructor origin; listenerId is 64
lowercase hex characters. No issuer callbacks or token are part of it. Extra
fields, proxies, accessors, or combining it with `actionToken` are rejected.

```js
// app and host remain in the trusted original bootstrap, in memory only.
const host = app.createManualActionHandoff(); // Once per original listener.
const client = createWalletApplicationClient({
  origin: app.origin,
  ownerToken: app.ownerAccess.token,
  manualActionHandoff: host.descriptor,
});
await client.refresh(); // Explicit original-state read only.
```

This opt-in returns the shared methods plus `canConfirm()`,
`getManualActionReview()`, `acceptManualActionGrant(grant)` and
`disconnectManualActionHost()`. After `review(action, exactOriginalBody)`, the
review getter exposes metadata only. The host may call
`host.authorizeReview(request)` only after the human authorizes that exact
review. The client must await `acceptManualActionGrant(grant)`; it checks the
original document/listener bindings and authenticated state commitment before
confirmation. The Node caller must present the review and obtain its own
explicit confirm; there is no Node consent dialog or automatic confirmation.
See [MANUAL-HANDOFF.md](../../../wallet-app/MANUAL-HANDOFF.md) for cancellation
and document transport responsibilities.

The handoff transport accepts grants only on the four existing account routes.
Registered original native TOP_UP/EXIT uses prepare/execute/reconcile and
refuses accountRecover. The sealed wrapped GRAPH requires this handoff for each
account step, including reconcile/recover; direct `issueActionCapability()` is
insufficient. It does not authorize native-claim or wrapped-withdrawal routes.

## Wrapped withdrawal exact-token example (sealed source only)

This is a local contract example for the reviewed candidate, not an executable
bootstrap or release recipe. `app` is the original exact-only application with a
genuine already-bound withdrawal session; `offer` is the unchanged offer from
an explicitly refreshed owner state. Neither placeholder may be constructed
from invented keys, artifacts, proofs, terms or copied authority objects.
`local-wrapped-change-01` is a fictitious local request identifier.

```js
const body = {
  requestId: 'local-wrapped-change-01',
  role: offer.terms.role,
  termsSHA256: offer.termsSHA256,
};
// Trusted host: only after explicit authorization of these exact prepare terms.
const access = app.issueActionCapability({
  action: 'wrappedWithdrawPrepare', body, ttlMs: 60_000,
});
const client = createWalletApplicationClient({
  origin: access.origin,
  ownerToken: app.ownerAccess.token,
  actionToken: access.token,
});
await client.refresh();
const review = client.review('wrappedWithdrawPrepare', body);
// Present review. Do not call confirm() until the user authorizes this step.
```

Prepare performs no signature/proof/send. Execute uses the same retained request
ID and termsSHA256 in a separately authorized `wrappedWithdrawExecute` body;
reconcile uses those same two fields with `wrappedWithdrawReconcile`. Each
requires its own one-use exact capability and review/confirm decision. Do not
turn these into an automatic three-call sequence. The account handoff descriptor
cannot import withdrawal tokens, and the SDK cannot mint or revoke capabilities.

A true return from `confirm()` means a valid durable-admission response for this
route, not confirmed delivery. A failed attempted POST, timeout or malformed
reply means UNKNOWN; retain the original ID/digest and use only original-state
reconciliation. `confirm()` can also return false before any POST if its local
review is invalid; inspect `getState()` rather than treating that boolean alone
as an outcome. Do
not repeat execute after key/proof/send uncertainty. The original encrypted
journal and retained send remain authoritative; local SDK state is not a durable
recovery record. Reconciliation cannot clear an uncertain receiver's mutation
fence. `cancelReview()` affects only the local unsent review. A private host can
call `app.revokeActionCapability(access)` for an unconsumed exact token, but
revocation neither cancels admitted work nor proves that an original send failed.

Update the server/shared codec/Node module together with their reviewed exact
source identities. This SDK is a Node/local bridge, not the historical
`omnichain-product/src/sdk.mjs` simulation API, a standalone wallet or a mobile
transport. See [application status and update rules](../../../wallet-app/README.md).
