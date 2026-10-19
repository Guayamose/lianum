# Mobile public protocol

Shared contracts for mobile, wallet clients, platform and backend. They contain no private keys, Node-only dependencies or authority to credit funds.

`src/wallet/contracts/` owns the schemas, validators and reviews previously located in the web client. `src/wallet/client/view-model.mjs` provides shared projection and explicit transport with an injected `fetchImpl`. Tokens stay in memory; it does not access the DOM. Former wallet paths re-export these implementations.

## Authorize one operation

`POST /v1/mobile/challenges` accepts `{ ownerPublicKey, intent }`. The intent has exactly these fields:

```js
{
  requestId,       // Original ASCII ID, 16–64 characters
  action,          // prepare | execute | reconcile | recover
  kind,            // TOP_UP | EXIT
  chain,           // ethereum | base | arbitrum | bnb | solana | bitcoin | tron
  assetId,         // Asset identity: 32 bytes, lowercase hex
  amountAtomic,    // Canonical positive u64 decimal
  recipient,       // ASCII destination, 1–128 characters
  maxFeeAtomic     // Canonical u64 decimal
}
```

The destination is byte-bounded. Its network format, native identity and binding to the original operation must be checked by the actual economic adapter. Inclusion in the chain enum does not establish end-to-end financial support.

The server creates and retains the challenge, returning `{ challenge }`:

```js
{
  version: 1,
  profile: 'LIANUM_MOBILE_AUTHORIZATION_V1',
  origin,          // Exact HTTPS service origin
  challengeId,     // 32 bytes, hex
  nonce,           // 32 bytes, hex
  expiresAt,       // Unix milliseconds; at most 300000 ms ahead
  ownerPublicKey,  // Uncompressed secp256k1: 04 + 64 bytes, hex
  intent
}
```

`mobileAuthorizationMessage()` canonicalizes field order and returns the ASCII bytes of `profile + '\n' + JSON.stringify(challenge)`. Sign their **SHA256** with ECDSA secp256k1, compact 64-byte IEEE-P1363, lowS. This has its own authorization domain. Encoding compatibility does not make it a graph-frame or Noir-note signature.

`POST /v1/mobile/authorizations` accepts only `{ challenge, signature }`. `normalizeMobileAuthorization()` checks format and lowS but **does not verify the signature**. Before any effect, the server must verify the public point/signature, origin, expiry, unchanged original challenge, executor terms and permissions, then consume authorization durably. Idempotency binds owner, original ID and action. An identical repeat returns the retained result without repeating the effect; changed terms cannot replace the original operation.

The response is exactly `{ status, requestId, operationState, retryAllowed }`:

| status | operationState | Meaning |
| --- | --- | --- |
| ACCEPTED | ADMITTED | Authorization admitted; settlement is not asserted |
| UNKNOWN | UNKNOWN | Observe the original operation to resolve the outcome |
| REJECTED | REJECTED | Rejection declared by the service |

`retryAllowed` is always `false`. These responses do not trigger automatic resubmission or establish a balance. The private key is never part of the contract.

## Read an original authorization receipt

`POST /v1/mobile/authorization-receipts` accepts exactly:

```js
{
  authorization: { challenge, signature }, // Unchanged original permission
  nonce,                                  // 32 random bytes, lowercase hex
  expiresAt,                              // Unix milliseconds; maximum 60000 ms ahead
  signature                               // New signature authorizing this read
}
```

`mobileReceiptMessage()` canonicalizes `{authorization,nonce,expiresAt}` and returns `LIANUM_MOBILE_AUTHORIZATION_RECEIPT_V1 + '\n' + JSON.stringify(review)` as bytes. It uses the same SHA256/secp256k1/IEEE-P1363/lowS signing convention. The new nonce must differ from both the original nonce and challengeId. The server checks both signatures, original origin/owner and the new read's expiry.

An expired original permission is accepted **only to read an already retained admission response**. It must match the consumed challenge, owner, requestId, action and original terms. This read neither creates/consumes challenges nor calls the economic adapter. It cannot execute expired authorization, and can work with the adapter disconnected while PostgreSQL remains available.

The response is exactly `{version:1,profile,nonce,challengeId,action,authorization}`. `profile` is the receipt domain; `authorization` is the original admission response above, not a balance or economic result. A 404, connection failure or timeout does not prove rejection or absence of effects. The client keeps the operation pending. A repeated valid read remains read-only; the client requires fresh consent and does not poll automatically.

`GET /v1/mobile/state` publishes availability and capabilities. Its current contract requires `privatePortfolio: null`; authenticated private state needs a separate contract extension and checks.

Tests in `apps/mobile/tests` and `services/api-server/tests` cover framing, signatures and admission. Device acceptance, recovery, cryptographic audit and actual financial integration have separate scopes.
